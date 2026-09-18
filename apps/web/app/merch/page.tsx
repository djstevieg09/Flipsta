"use client";

/**
 * 18 Sept 2026, Steven: "need to add a merch tab on the main landing page
 * with tshirts, caps and other items that people can buy." Real Stripe
 * Checkout per item (mode "payment", a UK shipping address collected by
 * Stripe itself, plus a flat shipping rate) — see
 * app/api/merch/checkout/route.ts. A paid order lands in merch_orders
 * (migration 0032) once the webhook confirms payment, visible to Steven
 * at /admin/merch-orders.
 *
 * 18 Sept 2026, Steven, same day: sent through real product photos, so
 * each card now shows the actual item (public/merch/*.jpg) instead of the
 * earlier emoji placeholder. Prices in MERCH_ITEMS are still placeholder
 * — no real pricing came with the photos.
 */
import { useEffect, useState } from "react";
import PageHero from "@/app/components/PageHero";
import { MERCH_ITEMS, MERCH_SHIPPING_GBP, MerchItemId } from "@flipsta/shared";

const ITEM_IDS = Object.keys(MERCH_ITEMS) as MerchItemId[];

export default function MerchPage() {
  const [signedIn, setSignedIn] = useState(true);
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [busyItem, setBusyItem] = useState<MerchItemId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setSignedIn(Boolean(d.profile)))
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    if (params.get("purchase") === "success") {
      setNotice("Payment received — thanks for the order! You'll hear from us once it ships.");
    } else if (params.get("purchase") === "cancelled") {
      setNotice("Checkout cancelled — no payment was taken.");
    }
  }, []);

  async function buy(id: MerchItemId) {
    const item = MERCH_ITEMS[id];
    const size = item.sizes ? sizes[id] ?? item.sizes[0] : undefined;
    setError(null);
    setBusyItem(id);
    try {
      const res = await fetch("/api/merch/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id, size, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't start checkout right now.");
        setBusyItem(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't start checkout right now.");
      setBusyItem(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Flipsta merch"
        title={
          <>
            Wear the <span className="text-gold">Flip</span>
          </>
        }
        subtitle={`T-shirts, caps and more, straight from the Flipsta shop. UK shipping is a flat £${MERCH_SHIPPING_GBP.toFixed(2)} per order.`}
        decorations={[
          { emoji: "👕", className: "-top-4 -left-6", animate: "bob" },
          { emoji: "🧢", className: "top-1 -right-7", animate: "sway" },
          { emoji: "🛍️", className: "-bottom-3 left-1/3 w-11 h-11", boxed: true, animate: "bob", delay: "0.4s" },
        ]}
      />

      {notice && <div className="card text-sm">{notice}</div>}
      {error && <div className="card text-sm text-red">{error}</div>}
      {!signedIn && (
        <div className="card text-sm">
          <a className="underline" href="/login">Sign in</a> to buy Flipsta merch — browsing is open to everyone.
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {ITEM_IDS.map((id) => {
          const item = MERCH_ITEMS[id];
          return (
            <div key={id} className="card flex flex-col gap-3">
              <div className="w-full aspect-square rounded-lg bg-surface2 border border-border overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="font-bold text-sm">{item.name}</div>
                <div className="text-gold font-extrabold text-lg">£{item.priceGBP.toFixed(2)}</div>
              </div>
              {item.sizes && (
                <div>
                  <label className="block text-[10px] font-bold text-textDim uppercase tracking-wide mb-1">Size</label>
                  <select
                    value={sizes[id] ?? item.sizes[0]}
                    onChange={(e) => setSizes((s) => ({ ...s, [id]: e.target.value }))}
                    className="w-full bg-surface2 border border-border rounded-lg px-2 py-1.5 text-sm"
                  >
                    {item.sizes.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                disabled={!signedIn || busyItem !== null}
                onClick={() => buy(id)}
                className="btn btn-primary w-full justify-center disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busyItem === id ? "Redirecting…" : "Buy Now"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
