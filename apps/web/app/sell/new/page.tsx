"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SALES_CHANNELS, suggestListingFromOpportunity } from "@flipsta/shared";

type ChannelConnection = { channel: string; connectable: boolean; connected: boolean };

type WonOpportunity = {
  id: string;
  category_id: string;
  categories: { name: string } | null;
  source_tier: string;
  source_retailer: string | null;
  source_price_gbp: number | null;
  estimated_resale_price_gbp: number | null;
  expected_margin_gbp: number;
  product_name: string | null;
  image_url: string | null;
};

/**
 * Section 7 / 12.1 — "the AI is automatically filling out the listing, the
 * user needs a switch to auto post it once they click submit and it
 * uploads to eBay, Depop, Etsy, Whatnot, StockX." This is that page:
 * pick a won opportunity, the title/price fields arrive pre-filled from
 * suggestListingFromOpportunity, flip Auto Cross-Post and tick channels,
 * submit -> POST /api/listings does the rest.
 */
export default function NewListingPage() {
  const [won, setWon] = useState<WonOpportunity[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selected, setSelected] = useState<WonOpportunity | null>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState("New");
  const [autoCrossPost, setAutoCrossPost] = useState(false);
  const [channels, setChannels] = useState<string[]>([]);
  const [tier, setTier] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [connections, setConnections] = useState<ChannelConnection[]>([]);

  useEffect(() => {
    fetch("/api/opportunities?won=true")
      .then((r) => r.json())
      .then((d) => setWon(d.opportunities ?? []));
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setTier(d.profile?.subscriptionTier ?? null));
    fetch("/api/channel-connections")
      .then((r) => r.json())
      .then((d) => setConnections(d.channels ?? []));
  }, []);

  const isChannelConnected = (key: string) => connections.find((c) => c.channel === key)?.connected ?? false;

  const canCrossPost = tier === "pro" || tier === "elite";

  function selectOpportunity(id: string) {
    setSelectedId(id);
    const opp = won.find((o) => o.id === id);
    setSelected(opp ?? null);
    if (!opp) return;
    const suggestion = suggestListingFromOpportunity({
      categoryName: opp.categories?.name ?? "Item",
      sourceTier: opp.source_tier,
      sourcePriceGBP: opp.source_price_gbp ?? 0,
      expectedMarginGBP: opp.expected_margin_gbp,
      productName: opp.product_name,
      sourceRetailer: opp.source_retailer,
    });
    setTitle(suggestion.suggestedTitle);
    setPrice(String(suggestion.suggestedPriceGBP));
    setDescription(suggestion.suggestedDescription);
  }

  function toggleChannel(key: string) {
    setChannels((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  }

  async function submit() {
    if (!selectedId || !title || !price) return;
    setSubmitting(true);
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunityId: selectedId,
        title,
        description,
        imageUrl: selected?.image_url ?? null,
        priceGBP: Number(price),
        condition,
        autoCrossPost,
        channels: autoCrossPost ? channels : [],
      }),
    });
    const data = await res.json();
    setResult(res.ok ? data : { error: data.error });
    setSubmitting(false);
  }

  return (
    <div className="space-y-4 max-w-lg">
      <h1 className="text-2xl font-bold">List an item</h1>
      <p className="text-textDim text-sm">
        AI-suggested title, photo, and description come from the won opportunity. Edit anything before submitting —
        this is exactly what buyers will see, on Flipsta and on any cross-posted channel.
      </p>

      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Won opportunity</label>
        <select
          className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
          value={selectedId}
          onChange={(e) => selectOpportunity(e.target.value)}
        >
          <option value="">Select…</option>
          {won.map((o) => (
            <option key={o.id} value={o.id}>
              {o.product_name ?? o.categories?.name ?? "Item"} — {o.source_tier}
            </option>
          ))}
        </select>
        {won.length === 0 && <p className="text-xs text-textFaint mt-1">No won opportunities yet — win one on the Opportunities page first.</p>}
      </div>

      {/* 26 Aug 2026, Steven: "when i list the item i need the photos,
          description and everything already showing to me so i can see
          what i am listing" — this is exactly what gets submitted below,
          shown as the buyer would see it, not hidden behind form fields
          until after the fact. */}
      {selected && (
        <div className="card flex gap-3">
          {selected.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.image_url} alt={title} className="w-20 h-20 object-cover rounded-lg border border-border shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-lg border border-border shrink-0 flex items-center justify-center text-[10px] text-textFaint text-center p-1">
              No photo captured for this item
            </div>
          )}
          <div className="text-xs text-textDim">
            <div className="font-bold text-text text-sm">{title || "—"}</div>
            {selected.source_retailer && <div>Bought from {selected.source_retailer}</div>}
            {typeof selected.source_price_gbp === "number" && <div>Your cost: £{selected.source_price_gbp.toFixed(2)}</div>}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Title</label>
        <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Description</label>
        <textarea
          className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm min-h-[80px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Price (GBP)</label>
          <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Condition</label>
          <select className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option>New</option>
            <option>Like new</option>
            <option>Used</option>
          </select>
        </div>
      </div>

      <div className="card">
        <label className={`flex items-center gap-2 text-sm font-bold mb-2 ${!canCrossPost ? "opacity-40" : ""}`}>
          <input type="checkbox" disabled={!canCrossPost} checked={autoCrossPost} onChange={(e) => setAutoCrossPost(e.target.checked)} />
          Auto cross-post to other marketplaces on submit
        </label>
        {!canCrossPost ? (
          <p className="text-xs text-gold">Upgrade to Pro or Elite to unlock multi-platform listing (Section 7).</p>
        ) : (
          <p className="text-xs text-textDim mb-3">
            Only channels you've connected below can be ticked — sign in once at{" "}
            <Link href="/settings/connections" className="underline">
              Connected accounts
            </Link>
            , it's a one-time step per marketplace. The actual post to a connected channel is still simulated until
            each platform's real listing-creation API is wired in — see INFRASTRUCTURE_TODO.md.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 mt-2">
          {SALES_CHANNELS.map((c) => {
            const connected = isChannelConnected(c.key);
            const disabled = !autoCrossPost || !canCrossPost || !connected;
            return (
              <label key={c.key} className={`flex items-center gap-2 text-sm ${disabled ? "opacity-40" : ""}`}>
                <input type="checkbox" disabled={disabled} checked={channels.includes(c.key)} onChange={() => toggleChannel(c.key)} />
                {c.name}
                {canCrossPost && !connected && <span className="text-textFaint">(not connected)</span>}
              </label>
            );
          })}
        </div>
      </div>

      <button className="btn btn-primary" disabled={!selectedId || submitting} onClick={submit}>
        {submitting ? "Submitting…" : "Submit listing"}
      </button>

      {result?.error && <p className="text-red text-sm">{result.error}</p>}
      {result?.listing && (
        <div className="card text-sm space-y-1">
          <p className="font-bold text-green">Listed.</p>
          {(result.crossPostResults ?? []).map((r: any, i: number) => (
            <p key={i} className="text-textDim">
              {r.channel}: {r.status === "posted" ? `posted -> ${r.external_url}` : "failed, will retry"}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
