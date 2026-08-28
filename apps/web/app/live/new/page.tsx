"use client";

import { useEffect, useState } from "react";

type MyListing = {
  id: string;
  price_gbp: number;
  sold_at: string | null;
  products: { title: string; condition: string } | null;
};

type QueuedItem = { id: string; title: string; startingBidGBP: number };

// 28 Aug 2026, Steven: "needs a design tool so people can design the
// viewing window... have multiple options." A small fixed set of banner
// presets (see live/[id]/page.tsx's OVERLAY_THEMES for the actual look)
// rather than a full drag-and-drop editor — kept in sync with migration
// 0029's overlay_theme check constraint.
const OVERLAY_THEME_OPTIONS = [
  { value: "classic", label: "Classic — brand colours, clean banner" },
  { value: "bold", label: "Bold — big, high-contrast, QVC-style" },
  { value: "minimal", label: "Minimal — small, unobtrusive" },
];

/**
 * 27 Aug 2026 — schedule a new live show, then (once created) queue items
 * into it from the host's own still-unsold listings. Deliberately reuses
 * the existing listing model (migration 0027's comments) rather than a
 * "type an item in mid-stream" flow, so this page's item picker is just
 * GET /api/listings?mine=true filtered to unsold.
 */
export default function NewLiveShowPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [overlayTheme, setOverlayTheme] = useState("classic");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showId, setShowId] = useState<string | null>(null);

  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [selectedListingId, setSelectedListingId] = useState("");
  const [startingBid, setStartingBid] = useState("");
  const [buyNow, setBuyNow] = useState("");
  const [shipping, setShipping] = useState("");
  const [queued, setQueued] = useState<QueuedItem[]>([]);
  const [itemMessage, setItemMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!showId) return;
    fetch("/api/listings?mine=true")
      .then((r) => r.json())
      .then((d) => setMyListings((d.listings ?? []).filter((l: MyListing) => !l.sold_at)));
  }, [showId]);

  async function createShow() {
    if (!title.trim()) {
      setError("Give the show a title.");
      return;
    }
    setCreating(true);
    setError(null);
    const res = await fetch("/api/live-shows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, scheduledAt: scheduledAt || null, overlayTheme }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setShowId(data.show.id);
  }

  async function addItem() {
    if (!selectedListingId || !startingBid) {
      setItemMessage("Pick a listing and a starting bid.");
      return;
    }
    const chosen = myListings.find((l) => l.id === selectedListingId);
    const res = await fetch(`/api/live-shows/${showId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId: selectedListingId,
        startingBidGBP: Number(startingBid),
        buyNowPriceGBP: buyNow ? Number(buyNow) : null,
        shippingGBP: shipping ? Number(shipping) : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setItemMessage(data.error ?? "Something went wrong.");
      return;
    }
    setQueued((q) => [...q, { id: data.item.id, title: chosen?.products?.title ?? "Item", startingBidGBP: Number(startingBid) }]);
    setMyListings((prev) => prev.filter((l) => l.id !== selectedListingId));
    setSelectedListingId("");
    setStartingBid("");
    setBuyNow("");
    setShipping("");
    setItemMessage(null);
  }

  if (!showId) {
    return (
      <div className="max-w-lg space-y-4">
        <h1 className="text-2xl font-bold">Schedule a live show</h1>
        <p className="text-textDim text-sm">Broadcast straight from your browser — no separate software to install.</p>
        <div className="card p-4 space-y-3">
          <label className="block text-sm">
            <span className="text-textDim">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Friday night sneaker drop" />
          </label>
          <label className="block text-sm">
            <span className="text-textDim">Description (optional)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" rows={3} />
          </label>
          <label className="block text-sm">
            <span className="text-textDim">Scheduled for (optional — leave blank to go live whenever you're ready)</span>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-textDim">Viewing window style</span>
            <select value={overlayTheme} onChange={(e) => setOverlayTheme(e.target.value)} className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm">
              {OVERLAY_THEME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button className="btn btn-primary text-sm px-4 py-2 w-full" onClick={createShow} disabled={creating}>
            {creating ? "Creating…" : "Create show"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Add items to "{title}"</h1>
      <p className="text-textDim text-sm">Queue a few items from your own unsold listings before you go live. You can add more later too.</p>

      <div className="card p-4 space-y-3">
        <label className="block text-sm">
          <span className="text-textDim">Listing</span>
          <select value={selectedListingId} onChange={(e) => setSelectedListingId(e.target.value)} className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm">
            <option value="">Choose one of your unsold listings…</option>
            {myListings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.products?.title ?? "Untitled"} — £{l.price_gbp}
              </option>
            ))}
          </select>
        </label>
        {myListings.length === 0 && (
          <p className="text-xs text-textDim">
            No unsold listings yet — <a href="/sell/new" className="underline">list an item</a> or add some{" "}
            <a href="/sell/stock" className="underline">from your own stock</a> first, then come back here to add it.
          </p>
        )}
        <label className="block text-sm">
          <span className="text-textDim">Starting bid (£)</span>
          <input type="number" min="0.01" step="0.01" value={startingBid} onChange={(e) => setStartingBid(e.target.value)} className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="text-textDim">Buy-now price (£, optional)</span>
          <input type="number" min="0.01" step="0.01" value={buyNow} onChange={(e) => setBuyNow(e.target.value)} className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="text-textDim">P&amp;P for this item (£, optional — leave blank to use the standard courier rate)</span>
          <input type="number" min="0" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" />
        </label>
        {itemMessage && <p className="text-sm text-textDim">{itemMessage}</p>}
        <button className="btn btn-primary text-sm px-4 py-2 w-full" onClick={addItem}>
          Add item
        </button>
      </div>

      {queued.length > 0 && (
        <div className="card p-4 space-y-2">
          <p className="text-xs font-bold text-textDim uppercase">
            Queued so far — sells in this order (you can reorder once you're on the show page)
          </p>
          <ol className="text-sm list-decimal list-inside space-y-1">
            {queued.map((q) => (
              <li key={q.id}>
                {q.title} — starting at £{q.startingBidGBP.toFixed(2)}
              </li>
            ))}
          </ol>
        </div>
      )}

      <a href={`/live/${showId}`} className="btn btn-ghost text-sm px-4 py-2 w-full block text-center">
        {queued.length > 0 ? `Done — go to show (${queued.length} item(s) queued)` : "Skip — go to show"}
      </a>
    </div>
  );
}
