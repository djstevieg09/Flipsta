"use client";

import { useEffect, useState } from "react";

type ShopItem = {
  id: string;
  product_name: string;
  description: string | null;
  image_url: string | null;
  rrp_gbp: number;
  our_price_gbp: number;
  unitsAvailable: number;
  categories: { name: string } | null;
};

type Product = {
  id: string;
  title: string;
  condition: string;
  description: string | null;
  image_url: string | null;
  lowestPriceGBP: number | null;
  sellerCount: number;
};

// 26 Aug 2026, Steven, on "Sold by Flipsta": "that would assume we are
// taking ownership of the sale. We are just a broker. so returns people
// will think they need to return to Flipsta when this is being fulfilled
// by our resellers." Flipsta sources the deal and takes payment (held in
// escrow — see api/shop-items/route.ts), but an independent Pro/Elite
// reseller is the one who actually buys and ships it (api/fulfillment).
// This line is shown wherever a buyer might reasonably assume Flipsta
// itself is shipping the parcel, and routes them to the existing support
// ticket system — Section 11's "sole channel for buyer-seller
// communication" per the terms draft — rather than implying "return it to
// Flipsta" like a normal retailer.
const FULFILLED_BY_RESELLER_NOTE =
  "Sourced by Flipsta, bought and shipped by an independent Flipsta reseller once you order. Flipsta holds payment and handles support — for any issue with an order, raise it via Support rather than contacting the retailer.";

/**
 * 26 Aug 2026, Steven: "the RRP is to be displayed along with our price,
 * description and photos, should have a buy now button." These come from
 * discoverOpportunities.ts's shop_candidates path — a genuine retailer
 * discount the AI found but couldn't back with independent resale evidence.
 * Shown above "Sold by other sellers" below, which is the original
 * peer-to-peer pooled catalogue (Section 11.4) — a different,
 * already-working feature, still exactly as it was.
 */
export default function ShopPage() {
  const [flipstaItems, setFlipstaItems] = useState<ShopItem[]>([]);
  const [flipstaLoading, setFlipstaLoading] = useState(true);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<ShopItem | null>(null);

  const [products, setProducts] = useState<Product[]>([]);

  async function loadFlipstaItems() {
    setFlipstaLoading(true);
    const res = await fetch("/api/shop-items");
    const data = await res.json();
    setFlipstaItems(data.items ?? []);
    setFlipstaLoading(false);
  }

  useEffect(() => {
    loadFlipstaItems();
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []));
  }, []);

  async function buyNow(item: ShopItem) {
    setBusy((b) => ({ ...b, [item.id]: true }));
    const res = await fetch("/api/shop-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id }),
    });
    const data = await res.json();
    setMessages((m) => ({
      ...m,
      [item.id]: res.ok
        ? `Bought for £${Number(data.pricePaidGBP).toFixed(2)} — see it in your Portfolio. Held until delivery is confirmed.`
        : data.error,
    }));
    setBusy((b) => ({ ...b, [item.id]: false }));
    if (res.ok) {
      setExpanded(null);
      loadFlipstaItems();
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Shop</h1>
        <p className="text-textDim text-sm">Buy AI-sourced deals, or from other Flipsta sellers, all in one place.</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-bold text-lg">AI-Sourced Deals</h2>
          <p className="text-textDim text-sm">Genuine discounts off RRP. {FULFILLED_BY_RESELLER_NOTE}</p>
        </div>
        {flipstaLoading && <p className="text-textDim text-sm">Loading…</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {flipstaItems.map((item) => {
            const discountPct = Math.round(((item.rrp_gbp - item.our_price_gbp) / item.rrp_gbp) * 100);
            return (
              <div key={item.id} className="card space-y-2">
                <button
                  onClick={() => setExpanded(item)}
                  className="block w-full text-left"
                  aria-label={`View details for ${item.product_name}`}
                >
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.product_name}
                      className="w-full h-36 object-cover rounded-lg border border-border hover:opacity-90 transition"
                    />
                  ) : (
                    <div className="w-full h-36 rounded-lg border border-border flex items-center justify-center text-[10px] text-textFaint">
                      No photo
                    </div>
                  )}
                </button>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <button onClick={() => setExpanded(item)} className="font-bold text-sm text-left hover:underline">
                      {item.product_name}
                    </button>
                    <div className="text-xs text-textDim">{item.categories?.name}</div>
                  </div>
                  {item.unitsAvailable > 1 && (
                    <span className="text-[10px] text-textDim border border-border rounded-full px-2 py-0.5 shrink-0">
                      {item.unitsAvailable} available
                    </span>
                  )}
                </div>
                {item.description && <div className="text-xs text-textDim line-clamp-3">{item.description}</div>}

                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-extrabold">£{item.our_price_gbp.toFixed(2)}</span>
                  <span className="text-xs text-textFaint line-through">RRP £{item.rrp_gbp.toFixed(2)}</span>
                  {discountPct > 0 && <span className="text-xs text-green font-bold">{discountPct}% off</span>}
                </div>

                <button
                  onClick={() => buyNow(item)}
                  disabled={busy[item.id]}
                  className="w-full rounded-lg py-2 text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#5b7cfa,#22d3ee)" }}
                >
                  Buy Now — £{item.our_price_gbp.toFixed(2)}
                </button>
                <button
                  onClick={() => setExpanded(item)}
                  className="w-full text-xs font-bold border border-border rounded-lg py-1.5 hover:border-brand2"
                >
                  View details
                </button>

                {messages[item.id] && <div className="text-xs text-textDim">{messages[item.id]}</div>}
              </div>
            );
          })}
          {!flipstaLoading && flipstaItems.length === 0 && (
            <p className="text-textDim text-sm col-span-full">No AI-sourced deals right now — check back soon.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-bold text-lg">Sold by other sellers</h2>
          <p className="text-textDim text-sm">
            Pooled lowest-ask pricing per product, computed from real <code>listings</code> rows via{" "}
            <code>/api/products</code> and <code>/api/listings</code> (Section 11.4 price-time priority).
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {products.map((p) => (
            <div key={p.id} className="card space-y-1">
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_url} alt={p.title} className="w-full h-32 object-cover rounded-lg border border-border mb-1" />
              ) : (
                <div className="w-full h-32 rounded-lg border border-border mb-1 flex items-center justify-center text-[10px] text-textFaint">
                  No photo
                </div>
              )}
              <div className="font-bold text-sm">{p.title}</div>
              <div className="text-xs text-textDim">{p.condition}</div>
              {p.description && <div className="text-xs text-textDim line-clamp-2">{p.description}</div>}
              <div className="text-lg font-extrabold">
                {p.lowestPriceGBP ? `from £${p.lowestPriceGBP.toFixed(2)}` : "No sellers yet"}
              </div>
              <div className="text-xs text-textDim">{p.sellerCount} seller(s)</div>
            </div>
          ))}
          {products.length === 0 && <p className="text-textDim text-sm col-span-full">No peer listings yet.</p>}
        </div>
      </section>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setExpanded(null)}
        >
          <div
            className="card max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            {expanded.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={expanded.image_url} alt={expanded.product_name} className="w-full h-64 object-cover rounded-lg border border-border" />
            ) : (
              <div className="w-full h-64 rounded-lg border border-border flex items-center justify-center text-xs text-textFaint">
                No photo
              </div>
            )}
            <div className="flex justify-between items-start gap-2">
              <div>
                <div className="font-bold text-lg">{expanded.product_name}</div>
                <div className="text-xs text-textDim">{expanded.categories?.name}</div>
              </div>
              <button onClick={() => setExpanded(null)} className="text-textDim hover:text-text text-sm shrink-0">
                Close ✕
              </button>
            </div>
            {expanded.description && <p className="text-sm text-textDim">{expanded.description}</p>}
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold">£{expanded.our_price_gbp.toFixed(2)}</span>
              <span className="text-sm text-textFaint line-through">RRP £{expanded.rrp_gbp.toFixed(2)}</span>
            </div>
            {expanded.unitsAvailable > 1 && (
              <div className="text-xs text-textDim">{expanded.unitsAvailable} available right now.</div>
            )}
            <p className="text-xs text-textDim border-t border-border pt-2">{FULFILLED_BY_RESELLER_NOTE}</p>
            <button
              onClick={() => buyNow(expanded)}
              disabled={busy[expanded.id]}
              className="w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#5b7cfa,#22d3ee)" }}
            >
              Buy Now — £{expanded.our_price_gbp.toFixed(2)}
            </button>
            {messages[expanded.id] && <div className="text-xs text-textDim">{messages[expanded.id]}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
