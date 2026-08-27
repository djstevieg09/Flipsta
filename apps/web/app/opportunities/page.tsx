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
  const [celebration, setCelebration] = useState<{ priceGBP: number; exiting: boolean } | null>(null);
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
      triggerCelebration(data.priceGBP);
    } else {
      setMessage(data.error);
    }
    load();
  }

  function triggerCelebration(priceGBP: number) {
    setCelebration({ priceGBP, exiting: false });
    setTimeout(() => setCelebration((c) => (c ? { ...c, exiting: true } : c)), 1700);
    setTimeout(() => setCelebration(null), 2000);
  }

  const urgencyColor: Record<string, string> = { hot: "text-red", standard: "text-brand", stable: "text-brand2" };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Live Opportunities</h1>
      <p className="text-textDim text-sm">Real opportunities our AI has found and verified. Sign in as a Standard tier member or above to bid.</p>
      {message && <div className="card text-sm">{message}</div>}
      {loading && <p className="text-textDim">Loading…</p>}

      {!loading && opportunities.length > 0 && <TotalReturnsBar opportunities={opportunities} />}

      <ActivityTicker />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {opportunities.map((o) => (
          <OpportunityCard
            key={o.id}
            o={o}
            now={now}
            tier={tier}
            urgencyColorClass={urgencyColor[o.urgency_tier]}
            onBid={() => placeBid(o.id, o.starting_bid_gbp)}
            onInstantWin={(quantity, withBuyback) => instantWin(o.id, quantity, withBuyback)}
          />
        ))}
      </div>

      {celebration && <InstantWinCelebration priceGBP={celebration.priceGBP} exiting={celebration.exiting} />}
    </div>
  );
}

function OpportunityCard({
  o,
  now,
  tier,
  urgencyColorClass,
  onBid,
  onInstantWin,
}: {
  o: Opportunity;
  now: number;
  tier: SubscriptionTier;
  urgencyColorClass: string;
  onBid: () => void;
  onInstantWin: (quantity: number, withBuyback: boolean) => void;
}) {
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

  return (
    <div className="card space-y-2">
      <div className="flex justify-between items-center">
        <span className={`text-xs font-bold uppercase flex items-center gap-1 ${urgencyColorClass}`}>
          {o.urgency_tier === "hot" && <span className="flame-icon">🔥</span>}
          {o.urgency_tier}
        </span>
        <span className="text-xs text-textDim">{Math.round(o.confidence_score * 100)}% confidence</span>
      </div>
      <div className="text-sm text-textDim">{o.source_tier}</div>

      {/* Outlay/returns — Steven's ask, 26 Aug 2026: outlay is what it
          costs to actually buy the item once you've won it (est., since
          the exact retailer + link stay hidden until then — see
          estimatedOutlay() above); returns is the profit, not the resale
          price, since "returns" means what you keep. Resale price and the
          Flipsta win price are still shown as the smaller supporting line
          — nothing removed, just the headline numbers changed to match
          what Steven asked to see first. */}
      <div className="grid grid-cols-2 gap-2 py-2 border-y border-border">
        <div>
          <div className="text-[10px] text-textDim uppercase tracking-wide">Outlay</div>
          <div className="font-bold">
            {estimatedOutlay(o) !== null ? `£${estimatedOutlay(o)!.toFixed(2)}` : "—"}
          </div>
          <div className="text-[10px] text-textDim">est. to buy the item · win it from £{o.instant_win_price_gbp.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[10px] text-textDim uppercase tracking-wide">Returns</div>
          <div className="font-bold text-green">£{o.expected_margin_gbp.toFixed(2)}</div>
          <div className="text-[10px] text-textDim">
            est. profit · resells ~
            {typeof o.estimated_resale_price_gbp === "number" ? `£${o.estimated_resale_price_gbp.toFixed(2)}` : "—"}
          </div>
        </div>
      </div>

      <div className="text-xs text-textDim">~{o.estimated_stock_units} units available</div>
      {o.ai_reasoning && <div className="text-xs text-textDim italic">{o.ai_reasoning}</div>}
      {remainingSeconds !== null && o.status === "live" && (
        <div className={`text-xs font-bold ${remainingSeconds <= 300 ? "text-red" : "text-gold"}`}>
          {remainingSeconds > 0 ? `Closes in ${formatCountdown(remainingSeconds)}` : "Closing…"}
        </div>
      )}
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
        <label className="flex items-center justify-between gap-2 text-xs pt-1 cursor-pointer">
          <span className="flex items-center gap-1.5">
            <input type="checkbox" checked={addBuyback} onChange={(e) => setAddBuyback(e.target.checked)} />
            Add buyback protection
          </span>
          <span className="text-textDim">+£{buybackPremiumGBP.toFixed(2)} · get {Math.round(BUYBACK_PAYOUT_PCT * 100)}% back if it doesn't sell</span>
        </label>
      )}

      <div className="flex gap-2 pt-2">
        <button className="btn btn-ghost flex-1" onClick={onBid}>
          Bid £{(o.starting_bid_gbp + 2).toFixed(2)}
        </button>
        <button className="btn btn-primary flex-1" onClick={() => onInstantWin(quantity, addBuyback)}>
          Instant win £{(totalPriceGBP + (addBuyback ? buybackPremiumGBP : 0)).toFixed(2)}
        </button>
      </div>
    </div>
  );
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

  if (items.length === 0) {
    return (
      <div className="card py-2 px-4 text-xs text-textDim">No bidding activity yet — be the first.</div>
    );
  }

  // Duplicated once so the CSS loop (translateX -50%) is seamless.
  const track = [...items, ...items];

  return (
    <div className="ticker-wrap card p-0">
      <div className="ticker-track">
        {track.map((a, i) => (
          <span key={`${a.id}-${i}`} className="ticker-item border-r border-border">
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
  );
}

const CONFETTI = ["🎉", "✨", "🔥", "💷", "🎊"];

function InstantWinCelebration({ priceGBP, exiting }: { priceGBP: number; exiting: boolean }) {
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
          Instant win locked in at <span className="text-text font-bold">£{priceGBP.toFixed(2)}</span>
        </div>
        <div className="text-xs text-textDim mt-2">
          Check <a href="/portfolio" className="underline">your Portfolio</a> for the retailer, price and link.
        </div>
      </div>
    </div>
  );
}
