"use client";

import { useEffect, useState } from "react";

type WishlistItem = {
  id: string;
  item_type: "shop_item" | "product";
  product_name: string;
  image_url: string | null;
  price_gbp: number;
  created_at: string;
  isAvailable: boolean;
};

/**
 * 26 Aug 2026, Steven: "wishlist / save for later" (confirmed via
 * AskUserQuestion). Deliberately separate from /portfolio — that page is
 * "what I've done", this is "what I might do" — same split Fulfillment jobs
 * already has its own tab for. Availability is re-derived server-side on
 * every load (see GET /api/wishlist) since a saved shop item can sell out
 * entirely; "View in shop" routes through the existing search rather than
 * duplicating Buy Now here, since the exact row a shop item snapshot points
 * to may no longer be the one that's actually still available.
 */
export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  function load() {
    setLoading(true);
    fetch("/api/wishlist")
      .then(async (r) => {
        if (r.status === 401) {
          setSignedIn(false);
          return { items: [] };
        }
        return r.json();
      })
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      });
  }

  useEffect(load, []);

  async function remove(id: string) {
    setBusy((b) => ({ ...b, [id]: true }));
    await fetch(`/api/wishlist/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
    setBusy((b) => ({ ...b, [id]: false }));
  }

  if (!signedIn) {
    return (
      <p className="text-textDim text-sm">
        <a className="underline" href="/login">Sign in</a> to see your wishlist.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Wishlist</h1>
      <p className="text-textDim text-sm">Items you&apos;ve saved for later. Availability is checked live.</p>
      {loading && <p className="text-textDim text-sm">Loading…</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.id} className="card space-y-2">
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt={item.product_name} className="w-full h-32 object-contain bg-surface2 rounded-lg border border-border" />
            ) : (
              <div className="w-full h-32 rounded-lg border border-border flex items-center justify-center text-[10px] text-textFaint">
                No photo
              </div>
            )}
            <div className="font-bold text-sm">{item.product_name}</div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-extrabold">£{item.price_gbp.toFixed(2)}</span>
              <span className={`text-[10px] font-bold ${item.isAvailable ? "text-green" : "text-textFaint"}`}>
                {item.isAvailable ? "Still available" : "No longer available"}
              </span>
            </div>
            <div className="flex gap-2">
              {item.isAvailable && (
                <a
                  href={`/shop?q=${encodeURIComponent(item.product_name)}`}
                  className="flex-1 text-center text-xs font-bold rounded-lg py-1.5 text-white"
                  style={{ background: "linear-gradient(135deg,#5b7cfa,#22d3ee)" }}
                >
                  View in shop
                </a>
              )}
              <button
                onClick={() => remove(item.id)}
                disabled={busy[item.id]}
                className="flex-1 text-xs font-bold border border-border rounded-lg py-1.5 hover:border-red hover:text-red disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && (
          <p className="text-textDim text-sm col-span-full">
            Nothing saved yet — browse <a href="/shop" className="underline text-brand2">the shop</a> and tap ♡ on anything you like.
          </p>
        )}
      </div>
    </div>
  );
}
