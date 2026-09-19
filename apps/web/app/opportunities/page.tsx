"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateBuybackPremium, BUYBACK_PAYOUT_PCT, SubscriptionTier } from "@flipsta/shared";

type Opportunity = {
  id: string;
  source_tier: string;
  margin_band_low: number;
  margin_band_high: number;
  estimated_resale_price_gbp: number | null;
  expected_margin_gbp: number;
  confidence_score: number;
  urgency_tier: "hot" | "standard" | "stable";
  estimated_stock_units: number;
  per_customer_cap: number | null;
  starting_bid_gbp: number;
  instant_win_price_gbp: number;
  action_clock_expires_at: string | null;
  status: string;
  ai_reasoning: string | null;
  // 18 Sept 2026 — fixed-price limited-allocation deals (migration 0034),
  // replacing bidding/instant-win for every deal found from here on.
  // Legacy rows have pricing_mode "auction" (or undefined, for anything
  // from before this column existed) and keep using bid/instant-win as
  // before.
  pricing_mode?: "auction" | "fixed_price";
  fixed_price_coins?: number | null;
  slots_taken?: number;
  already_purchased_slot?: boolean;
  // 19 Sept 2026 — cascading early access (see lib/tierGuard.ts): whether
  // the CURRENT viewer's tier is still waiting this one out, and when it
  // unlocks for them. Never used to hide a card — see LockOverlay below.
  early_access_locked?: boolean;
  early_access_reveals_at?: string | null;
};

/**
 * 26 Aug 2026, Steven: "i need the outlay to show per item outlay to
 * purchase it and also the returns to show per item profit." The API
 * never sends the exact source_price_gbp pre-win (Section 5's blind-teaser
 * redaction — see api/opportunities/route.ts), but it always sends
 * estimated_resale_price_gbp and expected_margin_gbp, and outlay is just
 * those two numbers apart (resale − profit = cost). So this doesn't
 * reveal anything the redaction is actually protecting — WHICH retailer
 * and the exact product link (source_retailer/source_url) stay hidden
 * until you win it; only the arithmetic your eyes could already do from
 * the resale price and the margin band is now spelled out directly.
 */
function estimatedOutlay(o: Opportunity): number | null {
  if (typeof o.estimated_resale_price_gbp !== "number") return null;
  return Math.round((o.estimated_resale_price_gbp - o.expected_margin_gbp) * 100) / 100;
}

type ActivityItem = {
  id: string;
  displayName: string;
  amountGBP: number;
  isInstantWin: boolean;
  categoryName: string;
  urgencyTier: "hot" | "standard" | "stable";
  createdAt: string;
};

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [celebration, setCelebration] = useState<{ label: string; exiting: boolean } | null>(null);
  // 27 Aug 2026: buyback insurance pricing depends on the buyer's own tier
  // (Pro/Elite get a discount, Section 7) — fetched once here rather than
  // per-card so every card's live premium estimate stays in sync.
  const [tier, setTier] = useState<SubscriptionTier>("standard");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/opportunities");
    const data = await res.json();
    setOpportunities(data.opportunities ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setTier(d.profile?.subscriptionTier ?? "standard"))
      .catch(() => {});
  }, []);

  // Drives every card's live countdown — one shared ticking clock rather
  // than a timer per card.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function placeBid(id: string, currentFloor: number) {
    const amount = currentFloor + 2;
    const res = await fetch(`/api/opportunities/${id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountGBP: amount }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Bid £${amount.toFixed(2)} placed.` : data.error);
    load();
  }

  // 26 Aug 2026, Steven: "when someone buys an oppotunity it should list
  // the item straight away once they have confirmed how many units they
  // brought." quantity now travels with the instant-win request, and the
  // response comes back already listed (or not, if auto-listing hit a
  // snag — see the route's try/catch) rather than needing a second step.
  async function instantWin(id: string, quantity: number, withBuyback: boolean) {
    const res = await fetch(`/api/opportunities/${id}/instant-win`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity, withBuyback }),
    });
    const data = await res.json();
    if (res.ok) {
      const buybackNote = data.buybackPremiumGBP ? ` Protected — £${data.buybackPremiumGBP.toFixed(2)} buyback premium.` : "";
      setMessage(
        (data.autoListed
          ? `Won for £${data.priceGBP} — listed on the marketplace automatically.`
          : `Won for £${data.priceGBP}.`) + buybackNote,
      );
      triggerCelebration(`£${data.priceGBP.toFixed(2)}`);
    } else {
      setMessage(data.error);
    }
    load();
  }

  // 18 Sept 2026 — the fixed-price equivalent of instantWin() above: no
  // quantity picker, no buyback add-on, just "buy your slot".
  async function buySlot(id: string) {
    const res = await fetch(`/api/opportunities/${id}/buy-slot`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setMessage(
        data.autoListed
          ? `Slot bought for ${data.priceCoins} Flippy Coins — listed on the marketplace automatically.`
          : `Slot bought for ${data.priceCoins} Flippy Coins.`,
      );
      triggerCelebration(`${data.priceCoins} Flippy Coins`);
    } else {
      setMessage(data.error);
    }
    load();
  }

  function triggerCelebration(label: string) {
    setCelebration({ label, exiting: false });
    setTimeout(() => setCelebration((c) => (c ? { ...c, exiting: true } : c)), 1700);
    setTimeout(() => setCelebration(null), 2000);
  }

  const urgencyColor: Record<string, string> = { hot: "text-red", standard: "text-brand", stable: "text-brand2" };

  return (
    <div className="space-y-4">
      <OpportunitiesHero />
      {message && <div className="card text-sm">{message}</div>}
      {loading && <p className="text-textDim">Loading…</p>}

      {!loading && opportunities.length > 0 && <TotalReturnsBar opportunities={opportunities} />}

      <ActivityTicker />

      {/* 18 Sept 2026, Steven: "need the list view only" — this was a
          responsive card grid (1/2/3 columns); every card is now a single
          full-width row instead, stacked in one list (see
          OpportunityCard's own layout below for the row redesign). */}
      <div className="flex flex-col gap-3">
        {opportunities.map((o) => (
          <OpportunityCard
            key={o.id}
            o={o}
            now={now}
            tier={tier}
            urgencyColorClass={urgencyColor[o.urgency_tier]}
            onBid={() => placeBid(o.id, o.starting_bid_gbp)}
            onInstantWin={(quantity, withBuyback) => instantWin(o.id, quantity, withBuyback)}
            onBuySlot={() => buySlot(o.id)}
          />
        ))}
      </div>

      {celebration && <InstantWinCelebration label={celebration.label} exiting={celebration.exiting} />}
    </div>
  );
}

/**
 * 18 Sept 2026, Steven: "can you have the mascot holding loads of money
 * notes on this page? with boxes around him." No image-generation tool is
 * available in this session to draw Flippy actually holding cash, so this
 * reuses the existing mascot photo (same one as the homepage/signup) and
 * builds the "money and boxes around him" scene the same way the
 * homepage's hero did for its own graphics that had no source art to
 * hand — small floating card/emoji elements around the image rather than
 * a new illustration. Also drops the one leftover "our AI has found" from
 * the old plain heading (18 Sept 2026's "remove AI from the webpage" pass
 * hadn't reached this page yet).
 */
function OpportunitiesHero() {
  return (
    <section className="card relative overflow-hidden p-6 md:p-8">
      <div className="relative flex flex-col md:flex-row items-center gap-6 md:gap-10">
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/flippy-mascot.jpg"
            alt="Flippy, the Flipsta mascot"
            className="w-32 md:w-40 rounded-2xl drop-shadow-[0_0_40px_rgba(242,181,69,0.35)]"
          />
          {/* Banknotes "held" around him rather than in-hand (no art to
              composite that into the photo itself). */}
          <span className="absolute -top-5 -left-7 text-3xl -rotate-[18deg] select-none" aria-hidden>💷</span>
          <span className="absolute top-1 -right-8 text-2xl rotate-[14deg] select-none" aria-hidden>💷</span>
          <span className="absolute -bottom-4 left-1/3 text-2xl rotate-[8deg] select-none" aria-hidden>💷</span>
          {/* Boxes around him — stock/shipping boxes, echoing "no
              inventory... we source it" rather than contradicting it: this
              is the moment right after a sale sources, not a warehouse. */}
          <div className="card absolute -left-9 bottom-3 w-14 h-14 flex items-center justify-center text-2xl -rotate-[10deg] shadow-xl hidden sm:flex" aria-hidden>📦</div>
          <div className="card absolute -right-9 top-4 w-12 h-12 flex items-center justify-center text-xl rotate-[12deg] shadow-xl hidden sm:flex" aria-hidden>📦</div>
          <div className="card absolute -right-6 -bottom-5 w-10 h-10 flex items-center justify-center text-lg rotate-[-6deg] shadow-xl hidden sm:flex" aria-hidden>📦</div>
        </div>
        <div className="flex-1 text-center md:text-left space-y-1.5">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            Live <span className="text-gold">Opportunities</span>
          </h1>
          <p className="text-textDim text-sm max-w-md mx-auto md:mx-0">
            Real opportunities we've found and verified. Sign in as a Standard tier member or above to grab a slot
            with your Flippy Coins.
          </p>
        </div>
      </div>
    </section>
  );
}

function OpportunityCard({
  o,
  now,
  tier,
  urgencyColorClass,
  onBid,
  onInstantWin,
  onBuySlot,
}: {
  o: Opportunity;
  now: number;
  tier: SubscriptionTier;
  urgencyColorClass: string;
  onBid: () => void;
  onInstantWin: (quantity: number, withBuyback: boolean) => void;
  onBuySlot: () => void;
}) {
  // 18 Sept 2026 — fixed-price deals get an entirely different action
  // column below (no auction, no quantity picker, no buyback add-on) —
  // legacy 'auction' rows (or anything from before pricing_mode existed)
  // keep the bid/instant-win UI exactly as it was.
  if (o.pricing_mode === "fixed_price") {
    return <FixedPriceDealCard o={o} now={now} urgencyColorClass={urgencyColorClass} onBuySlot={onBuySlot} />;
  }
  const remainingSeconds = o.action_clock_expires_at
    ? Math.max(0, Math.round((new Date(o.action_clock_expires_at).getTime() - now) / 1000))
    : null;

  // Steven's ask: "once they have confirmed how many units they brought" —
  // only worth showing a picker when there's actually a choice to make.
  // Capped by both how many units exist and (if set) how many one buyer's
  // allowed to take, matching the same two checks the route validates.
  const maxQuantity = Math.max(1, Math.min(o.estimated_stock_units, o.per_customer_cap ?? o.estimated_stock_units));
  const showQuantityPicker = o.status === "live" && maxQuantity > 1;
  const [quantity, setQuantity] = useState(1);

  // 27 Aug 2026, Steven: "is buyback insurance setup? need to do this if
  // not." Offered right at the checkout moment, priced off THIS
  // opportunity's own AI confidence score (Section 8.3) — the exact same
  // calculateBuybackPremium the API re-runs server-side before actually
  // charging anything, so what's shown here is never just a guess.
  const [addBuyback, setAddBuyback] = useState(false);
  const totalPriceGBP = o.instant_win_price_gbp * quantity;
  const buybackPremiumGBP = totalPriceGBP > 0 ? calculateBuybackPremium(totalPriceGBP, 1 - o.confidence_score, tier) : 0;

  // 18 Sept 2026, Steven: "need the list view only" — reflowed from a
  // vertical tile (stacked for a multi-column grid) into a single wide
  // row: a fixed-width identity column on the left, the stat grid filling
  // the middle, and the action column pinned to the right — the standard
  // "list view" shape for a feed like this, one row per opportunity, only
  // stacking back to vertical on small screens where a row can't fit.
  const locked = Boolean(o.early_access_locked && o.early_access_reveals_at);

  return (
    <div className="relative">
      {locked && <LockOverlay revealsAt={o.early_access_reveals_at!} now={now} />}
      <div className={`card flex flex-col md:flex-row md:items-center gap-4 ${locked ? "opacity-50 grayscale pointer-events-none" : ""}`}>
      <div className="md:w-40 shrink-0 space-y-1">
        <div className="flex items-center justify-between md:justify-start md:gap-2">
          <span className={`text-xs font-bold uppercase flex items-center gap-1 ${urgencyColorClass}`}>
            {o.urgency_tier === "hot" && <span className="flame-icon">🔥</span>}
            {o.urgency_tier}
          </span>
          <span className="text-xs text-textDim">{Math.round(o.confidence_score * 100)}%</span>
        </div>
        <div className="text-sm text-textDim">{o.source_tier}</div>
        {remainingSeconds !== null && o.status === "live" && (
          <div className={`text-xs font-bold ${remainingSeconds <= 300 ? "text-red" : "text-gold"}`}>
            {remainingSeconds > 0 ? `Closes in ${formatCountdown(remainingSeconds)}` : "Closing…"}
          </div>
        )}
      </div>

      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 md:border-x border-border md:px-4 py-2 md:py-0">
        {/* Outlay/returns — Steven's ask, 26 Aug 2026: outlay is what it
            costs to actually buy the item once you've won it (est., since
            the exact retailer + link stay hidden until then — see
            estimatedOutlay() above); returns is the profit, not the resale
            price, since "returns" means what you keep. */}
        <div>
          <div className="text-[10px] text-textDim uppercase tracking-wide">Outlay</div>
          <div className="font-bold">
            {estimatedOutlay(o) !== null ? `£${estimatedOutlay(o)!.toFixed(2)}` : "—"}
          </div>
          <div className="text-[10px] text-textDim">win it from £{o.instant_win_price_gbp.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[10px] text-textDim uppercase tracking-wide">Returns</div>
          <div className="font-bold text-green">£{o.expected_margin_gbp.toFixed(2)}</div>
          <div className="text-[10px] text-textDim">
            resells ~{typeof o.estimated_resale_price_gbp === "number" ? `£${o.estimated_resale_price_gbp.toFixed(2)}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-textDim uppercase tracking-wide">Units</div>
          <div className="font-bold">~{o.estimated_stock_units}</div>
          <div className="text-[10px] text-textDim">available</div>
        </div>
        {o.ai_reasoning ? (
          <div className="col-span-2 md:col-span-1">
            <div className="text-[10px] text-textDim uppercase tracking-wide">Why it's here</div>
            <div className="text-xs text-textDim italic">{o.ai_reasoning}</div>
          </div>
        ) : (
          <div />
        )}
      </div>

      <div className="md:w-64 shrink-0 space-y-2">
        {showQuantityPicker && (
          <div className="flex items-center justify-between text-xs">
            <label htmlFor={`qty-${o.id}`} className="text-textDim">
              Units to buy
            </label>
            <select
              id={`qty-${o.id}`}
              className="bg-surface2 border border-border rounded-lg px-2 py-1"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            >
              {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}

        {o.status === "live" && tier !== "free" && (
          <label className="flex items-center justify-between gap-2 text-xs cursor-pointer">
            <span className="flex items-center gap-1.5">
              <input type="checkbox" checked={addBuyback} onChange={(e) => setAddBuyback(e.target.checked)} />
              Buyback protection
            </span>
            <span className="text-textDim">+£{buybackPremiumGBP.toFixed(2)}</span>
          </label>
        )}

        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={onBid}>
            Bid £{(o.starting_bid_gbp + 2).toFixed(2)}
          </button>
          <button className="btn btn-primary flex-1" onClick={() => onInstantWin(quantity, addBuyback)}>
            Win £{(totalPriceGBP + (addBuyback ? buybackPremiumGBP : 0)).toFixed(2)}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

/**
 * 18 Sept 2026 — fixed-price limited-allocation deals (migration 0034):
 * Steven, verbatim: "a finite deal found with limited stock we are
 * offering to one person... get rid of bidding and have a fixed price."
 * No auction, no quantity picker, no buyback add-on — one slot per
 * person, at the price already fixed on the row, paid in Flippy Coins.
 * estimated_stock_units is the running total of slots ever released for
 * this deal (grows when evaluateBatchRelisting.ts opens another batch);
 * slots_taken is how many are gone so far.
 */
function FixedPriceDealCard({
  o,
  now,
  urgencyColorClass,
  onBuySlot,
}: {
  o: Opportunity;
  now: number;
  urgencyColorClass: string;
  onBuySlot: () => void;
}) {
  const slotsTaken = o.slots_taken ?? 0;
  const slotsTotal = o.estimated_stock_units;
  const slotsLeft = Math.max(0, slotsTotal - slotsTaken);
  const soldOut = o.status === "sold_out" || slotsLeft <= 0;
  const locked = Boolean(o.early_access_locked && o.early_access_reveals_at);

  return (
    <div className="relative">
      {locked && <LockOverlay revealsAt={o.early_access_reveals_at!} now={now} />}
      <div className={`card flex flex-col md:flex-row md:items-center gap-4 ${locked ? "opacity-50 grayscale pointer-events-none" : ""}`}>
      <div className="md:w-40 shrink-0 space-y-1">
        <div className="flex items-center justify-between md:justify-start md:gap-2">
          <span className={`text-xs font-bold uppercase flex items-center gap-1 ${urgencyColorClass}`}>
            {o.urgency_tier === "hot" && <span className="flame-icon">🔥</span>}
            {o.urgency_tier}
          </span>
          <span className="text-xs text-textDim">{Math.round(o.confidence_score * 100)}%</span>
        </div>
        <div className="text-sm text-textDim">{o.source_tier}</div>
        <div className={`text-xs font-bold ${soldOut ? "text-red" : "text-gold"}`}>
          {soldOut ? "Sold out" : `${slotsLeft} of ${slotsTotal} slots left`}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 md:border-x border-border md:px-4 py-2 md:py-0">
        <div>
          <div className="text-[10px] text-textDim uppercase tracking-wide">Outlay</div>
          <div className="font-bold">{estimatedOutlay(o) !== null ? `£${estimatedOutlay(o)!.toFixed(2)}` : "—"}</div>
          <div className="text-[10px] text-textDim">{o.fixed_price_coins} Flippy Coins to buy in</div>
        </div>
        <div>
          <div className="text-[10px] text-textDim uppercase tracking-wide">Returns</div>
          <div className="font-bold text-green">£{o.expected_margin_gbp.toFixed(2)}</div>
          <div className="text-[10px] text-textDim">
            resells ~{typeof o.estimated_resale_price_gbp === "number" ? `£${o.estimated_resale_price_gbp.toFixed(2)}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-textDim uppercase tracking-wide">Slots</div>
          <div className="font-bold">
            {slotsTaken}/{slotsTotal}
          </div>
          <div className="text-[10px] text-textDim">taken</div>
        </div>
        {o.ai_reasoning ? (
          <div className="col-span-2 md:col-span-1">
            <div className="text-[10px] text-textDim uppercase tracking-wide">Why it's here</div>
            <div className="text-xs text-textDim italic">{o.ai_reasoning}</div>
          </div>
        ) : (
          <div />
        )}
      </div>

      <div className="md:w-64 shrink-0 space-y-2">
        {o.already_purchased_slot ? (
          <div className="btn btn-ghost flex-1 w-full text-center cursor-default">✓ You have a slot</div>
        ) : (
          <button className="btn btn-primary w-full disabled:opacity-50" disabled={soldOut} onClick={onBuySlot}>
            {soldOut ? "Sold out" : `Buy your slot — ${o.fixed_price_coins} coins`}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

/**
 * 19 Sept 2026, Steven: "lower tiers should see the full package but grey
 * it out explaining an upgrade it required to unlock this service." Sits
 * on top of the card (which stays in the DOM, greyed + non-interactive
 * underneath) rather than replacing it, so the layout doesn't jump between
 * a locked and unlocked view of the same opportunity as its countdown
 * clears.
 */
function LockOverlay({ revealsAt, now }: { revealsAt: string; now: number }) {
  const remainingSeconds = Math.max(0, Math.round((new Date(revealsAt).getTime() - now) / 1000));
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-bg/85 backdrop-blur-sm text-center px-4 py-3">
      <span className="text-2xl" aria-hidden>🔒</span>
      <div className="text-sm font-bold text-gold">Unlocks in {formatLockCountdown(remainingSeconds)}</div>
      <div className="text-xs text-textDim max-w-xs">Higher tiers get first access to new opportunities.</div>
      <a href="/upgrade" className="btn btn-primary text-xs px-4 py-1.5 mt-1">Upgrade to unlock now</a>
    </div>
  );
}

function formatLockCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "moments";
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes >= 60) {
    const h = Math.floor(totalMinutes / 60);
    return `${h}h ${totalMinutes % 60}m`;
  }
  if (totalMinutes > 0) return `${totalMinutes}m ${totalSeconds % 60}s`;
  return `${totalSeconds}s`;
}

/** Steven's ask, 26 Aug 2026: "also show total est returns" — the sum of
 * every live opportunity's expected profit, so there's one headline number
 * for "what's the whole feed worth right now" without adding each card up
 * by hand. */
function TotalReturnsBar({ opportunities }: { opportunities: Opportunity[] }) {
  const live = opportunities.filter((o) => o.status === "live");
  const totalReturns = live.reduce((sum, o) => sum + (o.expected_margin_gbp ?? 0), 0);
  const totalOutlay = live.reduce((sum, o) => sum + (estimatedOutlay(o) ?? 0), 0);

  return (
    <div className="card flex flex-wrap gap-x-6 gap-y-1 items-baseline">
      <div>
        <span className="text-[10px] text-textDim uppercase tracking-wide mr-1">Total est. returns</span>
        <span className="font-bold text-green">£{totalReturns.toFixed(2)}</span>
      </div>
      <div>
        <span className="text-[10px] text-textDim uppercase tracking-wide mr-1">Total est. outlay</span>
        <span className="font-bold">£{totalOutlay.toFixed(2)}</span>
      </div>
      <div className="text-[10px] text-textDim">across {live.length} live {live.length === 1 ? "opportunity" : "opportunities"}</div>
    </div>
  );
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Steven's "real community stuff" ask, now as a stock-ticker style marquee
 * across the top instead of a sidebar card. Still reads the real bids
 * table via /api/activity (the signed-off mockups faked this with random
 * names — mockups/*.html: addFeedItem()) — only the presentation changed.
 */
function ActivityTicker() {
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/activity");
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json();
        setItems(data.activity ?? []);
      }
    }
    load();
    const t = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // 18 Sept 2026, Steven: "the scrolling banner needs to be more visual
  // and fitting to the theme of the site" — was a plain-bordered card
  // with plain text items. Same live /api/activity data and marquee
  // mechanics, now with a gold gradient glow (.ticker-glow, globals.css),
  // a pulsing "live" label above it, and a per-item avatar badge instead
  // of bare text.
  if (items.length === 0) {
    return (
      <div className="ticker-glow rounded-xl py-2.5 px-4 text-xs text-textDim">No bidding activity yet — be the first.</div>
    );
  }

  // Duplicated once so the CSS loop (translateX -50%) is seamless.
  const track = [...items, ...items];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gold px-1">
        <span className="live-dot" />
        Live activity
      </div>
      <div className="ticker-wrap ticker-glow rounded-xl">
        <div className="ticker-track">
          {track.map((a, i) => (
            <span key={`${a.id}-${i}`} className="ticker-item border-r border-gold/20">
              <span className="w-6 h-6 rounded-full bg-gold/15 text-gold text-[11px] font-bold flex items-center justify-center shrink-0">
                {a.displayName.charAt(0).toUpperCase()}
              </span>
              {a.urgencyTier === "hot" && <span className="flame-icon">🔥</span>}
              <span className="text-textFaint uppercase text-[10px] tracking-wide">{a.categoryName}</span>
              <b className="text-brand2">{a.displayName}</b>
              {a.isInstantWin ? (
                <span className="text-gold font-bold">
                  WON £{a.amountGBP.toFixed(2)} 🏆
                </span>
              ) : (
                <span className="text-green font-bold">
                  £{a.amountGBP.toFixed(2)} ▲
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const CONFETTI = ["🎉", "✨", "🔥", "💷", "🎊"];

function InstantWinCelebration({ label, exiting }: { label: string; exiting: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        emoji: CONFETTI[i % CONFETTI.length],
        left: Math.round(Math.random() * 100),
        delay: Math.round(Math.random() * 300),
      })),
    [],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pointer-events-none">
      <div className={`relative card px-8 py-6 text-center ${exiting ? "win-pop-exit" : "win-pop-enter"}`}>
        {pieces.map((p, i) => (
          <span
            key={i}
            className="win-confetti-piece text-lg"
            style={{ left: `${p.left}%`, animationDelay: `${p.delay}ms` }}
          >
            {p.emoji}
          </span>
        ))}
        <div className="text-3xl mb-1">🎉</div>
        <div className="text-lg font-bold">You won it!</div>
        <div className="text-textDim text-sm mt-1">
          Locked in at <span className="text-text font-bold">{label}</span>
        </div>
        <div className="text-xs text-textDim mt-2">
          Check <a href="/portfolio" className="underline">your Portfolio</a> for the retailer, price and link.
        </div>
      </div>
    </div>
  );
}
