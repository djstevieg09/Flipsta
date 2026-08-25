"use client";

import { useEffect, useMemo, useState } from "react";

type Opportunity = {
  id: string;
  source_tier: string;
  margin_band_low: number;
  margin_band_high: number;
  estimated_resale_price_gbp: number | null;
  confidence_score: number;
  urgency_tier: "hot" | "standard" | "stable";
  estimated_stock_units: number;
  starting_bid_gbp: number;
  instant_win_price_gbp: number;
  action_clock_expires_at: string | null;
  status: string;
  ai_reasoning: string | null;
};

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

  async function load() {
    setLoading(true);
    const res = await fetch("/api/opportunities");
    const data = await res.json();
    setOpportunities(data.opportunities ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
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

  async function instantWin(id: string) {
    const res = await fetch(`/api/opportunities/${id}/instant-win`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setMessage(`Won for £${data.priceGBP}.`);
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

      <ActivityTicker />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {opportunities.map((o) => (
          <OpportunityCard
            key={o.id}
            o={o}
            now={now}
            urgencyColorClass={urgencyColor[o.urgency_tier]}
            onBid={() => placeBid(o.id, o.starting_bid_gbp)}
            onInstantWin={() => instantWin(o.id)}
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
  urgencyColorClass,
  onBid,
  onInstantWin,
}: {
  o: Opportunity;
  now: number;
  urgencyColorClass: string;
  onBid: () => void;
  onInstantWin: () => void;
}) {
  const remainingSeconds = o.action_clock_expires_at
    ? Math.max(0, Math.round((new Date(o.action_clock_expires_at).getTime() - now) / 1000))
    : null;

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

      {/* Outlay/returns — what you'd pay vs. what it's expected to sell
          for, side by side, so both numbers are visible at a glance. */}
      <div className="grid grid-cols-2 gap-2 py-2 border-y border-border">
        <div>
          <div className="text-[10px] text-textDim uppercase tracking-wide">Outlay</div>
          <div className="font-bold">£{o.instant_win_price_gbp.toFixed(2)}</div>
          <div className="text-[10px] text-textDim">or bid from £{(o.starting_bid_gbp + 2).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[10px] text-textDim uppercase tracking-wide">Returns</div>
          <div className="font-bold text-green">
            {typeof o.estimated_resale_price_gbp === "number" ? `£${o.estimated_resale_price_gbp.toFixed(2)}` : "—"}
          </div>
          <div className="text-[10px] text-textDim">
            est. resale · {Math.round(o.margin_band_low * 100)}–{Math.round(o.margin_band_high * 100)}% margin
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
      <div className="flex gap-2 pt-2">
        <button className="btn btn-ghost flex-1" onClick={onBid}>
          Bid £{(o.starting_bid_gbp + 2).toFixed(2)}
        </button>
        <button className="btn btn-primary flex-1" onClick={onInstantWin}>
          Instant win £{o.instant_win_price_gbp.toFixed(2)}
        </button>
      </div>
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
