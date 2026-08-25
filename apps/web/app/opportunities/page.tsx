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
      <p className="text-textDim text-sm">
        Real data from Postgres via <code>/api/opportunities</code>. Sign in as a Standard+ tier user to bid —
        see <code>INFRASTRUCTURE_TODO.md</code> for creating a test account once Supabase is connected.
      </p>
      {message && <div className="card text-sm">{message}</div>}
      {loading && <p className="text-textDim">Loading…</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
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

        <div className="card">
          <h3 className="font-bold text-sm">Live activity</h3>
          <p className="text-xs text-textDim mb-2">Real-time bidding across the platform</p>
          <ActivityFeed />
        </div>
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
      <div className="font-bold">
        Margin band {Math.round(o.margin_band_low * 100)}–{Math.round(o.margin_band_high * 100)}%
      </div>
      {typeof o.estimated_resale_price_gbp === "number" && (
        <div className="text-xs text-textDim">
          Est. resale value: <span className="text-text font-bold">£{o.estimated_resale_price_gbp.toFixed(2)}</span>
        </div>
      )}
      <div className="text-xs text-textDim">~{o.estimated_stock_units} units available</div>
      {o.ai_reasoning && <div className="text-xs text-textDim italic">{o.ai_reasoning}</div>}
      {remainingSeconds !== null && o.status === "live" && (
        <div className={`text-xs font-bold ${remainingSeconds <= 300 ? "text-red" : "text-gold"}`}>
          {remainingSeconds > 0 ? `Closes in ${formatCountdown(remainingSeconds)}` : "Closing…"}
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <div className="flex flex-col flex-1">
          <span className="text-[10px] text-textDim uppercase">Buy in from</span>
          <button className="btn btn-ghost" onClick={onBid}>
            Bid £{(o.starting_bid_gbp + 2).toFixed(2)}
          </button>
        </div>
        <div className="flex flex-col flex-1">
          <span className="text-[10px] text-textDim uppercase">Skip the auction</span>
          <button className="btn btn-primary" onClick={onInstantWin}>
            Instant win £{o.instant_win_price_gbp.toFixed(2)}
          </button>
        </div>
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
 * Steven's "real community stuff" ask — the signed-off mockups faked this
 * with random names (mockups/*.html: addFeedItem()); this reads the actual
 * bids table via /api/activity, polling rather than inventing anything.
 */
function ActivityFeed() {
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
    return <p className="text-xs text-textDim">No bidding activity yet — be the first.</p>;
  }

  return (
    <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto">
      {items.map((a) => (
        <div key={a.id} className="feed-item text-xs bg-surface2 border border-border rounded-lg px-2.5 py-2">
          <div>
            {a.urgencyTier === "hot" && <span className="flame-icon mr-1">🔥</span>}
            <b className="text-brand2">{a.displayName}</b>{" "}
            {a.isInstantWin ? (
              <>instant-won a {a.categoryName} opportunity for £{a.amountGBP.toFixed(2)}</>
            ) : (
              <>bid £{a.amountGBP.toFixed(2)} on a {a.categoryName} opportunity</>
            )}
          </div>
          <div className="text-textFaint mt-0.5">{timeAgo(a.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
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
