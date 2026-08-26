"use client";

import { useEffect, useState } from "react";

type PendingItem = {
  id: string;
  product_name: string;
  description: string | null;
  rrp_gbp: number;
  our_price_gbp: number;
  source_retailer: string;
  source_url: string;
  categories: { name: string } | null;
};

/**
 * 26 Aug 2026, Steven: "if any pictures missing from listings it goes to
 * admin dashboard to add a picture before its uploaded to shop." Items land
 * here instead of /shop whenever the AI sourced a genuine discount but
 * couldn't find a usable product photo — adding a URL here is what makes
 * the item start showing on the public shop (see
 * /api/shop-items-missing-photos/[id]'s comment).
 */
export default function AdminShopPhotosPage() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/shop-items-missing-photos")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  }

  useEffect(load, []);

  async function savePhoto(id: string) {
    const imageUrl = (drafts[id] ?? "").trim();
    if (!imageUrl) return;
    setBusy((b) => ({ ...b, [id]: true }));
    const res = await fetch(`/api/admin/shop-items-missing-photos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    });
    const data = await res.json();
    setBusy((b) => ({ ...b, [id]: false }));
    if (!res.ok) {
      setMessage(data.error);
      return;
    }
    setMessage(`Photo added — ${items.find((i) => i.id === id)?.product_name} is now live on the shop.`);
    load();
  }

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">
        Genuine discounts the AI sourced but couldn&apos;t find a photo for — these stay off <code>/shop</code> until
        a photo is added here. Source retailer/link is shown here (admin-only) to help find a real product photo.
      </p>
      {message && <p className="text-xs text-brand2">{message}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => (
          <div key={item.id} className="card space-y-2">
            <div className="flex justify-between items-start gap-2">
              <div>
                <div className="font-bold text-sm">{item.product_name}</div>
                <div className="text-xs text-textDim">{item.categories?.name}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-sm">£{item.our_price_gbp.toFixed(2)}</div>
                <div className="text-[10px] text-textFaint line-through">RRP £{item.rrp_gbp.toFixed(2)}</div>
              </div>
            </div>
            {item.description && <div className="text-xs text-textDim line-clamp-2">{item.description}</div>}
            {/* 26 Aug 2026, Steven: "i will need the link for the item on
                the admin dashboard so i know where to get the photos
                from." Made this a full-width button rather than an inline
                text link — it's the first thing to click on this card. */}
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center text-xs font-bold border border-brand2 text-brand2 rounded-lg py-1.5 hover:bg-brand2/10"
            >
              Open on {item.source_retailer} ↗
            </a>
            <div className="flex gap-2">
              <input
                type="text"
                value={drafts[item.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                placeholder="Photo URL…"
                className="flex-1 bg-surface2 border border-border rounded-lg py-1.5 px-2 text-xs text-text placeholder:text-textFaint focus:outline-none focus:border-brand2"
              />
              <button
                onClick={() => savePhoto(item.id)}
                disabled={busy[item.id] || !(drafts[item.id] ?? "").trim()}
                className="text-xs font-bold text-white rounded-lg px-3 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#5b7cfa,#22d3ee)" }}
              >
                Add photo
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-textDim text-sm col-span-full">Nothing waiting on a photo right now.</p>}
      </div>
    </div>
  );
}
