"use client";

import { useEffect, useState } from "react";

type Opportunity = {
  id: string;
  source_tier: string;
  margin_band_low: number;
  margin_band_high: number;
  confidence_score: number;
  urgency_tier: "hot" | "standard" | "stable";
  estimated_stock_units: number;
  starting_bid_gbp: number;
  instant_win_price_gbp: number;
  status: string;
  ai_reasoning: string | null;
};

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

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
    setMessage(res.ok ? `Won for £${data.priceGBP}.` : data.error);
    load();
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {opportunities.map((o) => (
          <div key={o.id} className="card space-y-2">
            <div className="flex justify-between items-center">
              <span className={`text-xs font-bold uppercase ${urgencyColor[o.urgency_tier]}`}>{o.urgency_tier}</span>
              <span className="text-xs text-textDim">{Math.round(o.confidence_score * 100)}% confidence</span>
            </div>
            <div className="text-sm text-textDim">{o.source_tier}</div>
            <div className="font-bold">
              Margin band {Math.round(o.margin_band_low * 100)}–{Math.round(o.margin_band_high * 100)}%
            </div>
            <div className="text-xs text-textDim">~{o.estimated_stock_units} units available</div>
            {o.ai_reasoning && <div className="text-xs text-textDim italic">{o.ai_reasoning}</div>}
            <div className="flex gap-2 pt-2">
              <button className="btn btn-ghost flex-1" onClick={() => placeBid(o.id, o.starting_bid_gbp)}>
                Bid £{(o.starting_bid_gbp + 2).toFixed(2)}
              </button>
              <button className="btn btn-primary flex-1" onClick={() => instantWin(o.id)}>
                Instant win £{o.instant_win_price_gbp.toFixed(2)}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
