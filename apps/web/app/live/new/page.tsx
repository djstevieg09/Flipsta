"use client";

import { useEffect, useState } from "react";

type MyListing = {
  id: string;
  price_gbp: number;
  sold_at: string | null;
  products: { title: string; condition: string } | null;
};

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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showId, setShowId] = useState<string | null>(null);

  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [selectedListingId, setSelectedListingId] = useState("");
  const [startingBid, setStartingBid] = useState("");
  const [buyNow, setBuyNow] = useState("");
  const [queuedCount, setQueuedCount] = useState(0);
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
      body: JSON.stringify({ title, description, scheduledAt: scheduledAt || null }),
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
    const res = await fetch(`/api/live-shows/${showId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId: selectedListingId,
        startingBidGBP: Number(startingBid),
        buyNowPriceGBP: buyNow ? Number(buyNow) : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setItemMessage(data.error ?? "Something went wrong.");
      return;
    }
    setQueuedCount((c) => c + 1);
    setMyListings((prev) => prev.filter((l) => l.id !== selectedListingId));
    setSelectedListingId("");
    setStartingBid("");
    setBuyNow("");
    setItemMessage(`Added — ${queuedCount + 1} item(s) queued so far.`);
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
            No unsold listings yet — <a href="/sell/new" className="underline">list an item</a> first, then come back here to add it.
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
        {itemMessage && <p className="text-sm text-textDim">{itemMessage}</p>}
        <button className="btn btn-primary text-sm px-4 py-2 w-full" onClick={addItem}>
          Add item
        </button>
      </div>

      <a href={`/live/${showId}`} className="btn btn-ghost text-sm px-4 py-2 w-full block text-center">
        {queuedCount > 0 ? `Done — go to show (${queuedCount} item(s) queued)` : "Skip — go to show"}
      </a>
    </div>
  );
}
