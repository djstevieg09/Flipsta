"use client";

import { useEffect, useState } from "react";

type AffiliateProduct = {
  id: string;
  advertiser_name: string;
  title: string;
  description: string | null;
  image_url: string | null;
  category_id: string | null;
  price_gbp: number | null;
  rrp_gbp: number | null;
  affiliate_url: string;
  categories: { name: string } | null;
};
type Category = { id: string; name: string };

/**
 * 27 Aug 2026, Steven: "i need assistance setting up Awin api to fill my
 * store with goods... earn comission off items through affiliate
 * programs, this is seperate from our core buisness." Genuinely separate
 * from Flipsta Sourced Deals and the peer marketplace on /shop — every
 * card here sends the shopper to buy on the merchant's own site through
 * Awin's tracked link, so Flipsta earns a commission but never touches
 * the payment, shipping, or stock. The disclosure text below isn't just
 * politeness — UK ASA/CAP rules require clear affiliate-link disclosure,
 * same discipline this app already applies to the "Flipsta is just a
 * broker" copy on /shop.
 */
export default function PartnerDealsPage() {
  const [products, setProducts] = useState<AffiliateProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = categoryId ? `/api/affiliate-products?categoryId=${categoryId}` : "/api/affiliate-products";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .finally(() => setLoading(false));
  }, [categoryId]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Partner Deals</h1>
        <p className="text-textDim text-sm max-w-2xl">
          Real deals from Flipsta's retail partners. Every "Buy on" button takes you to complete your purchase on
          that retailer's own site — Flipsta doesn't hold, ship, or process payment for anything below, and may earn
          a commission if you buy through the link.
        </p>
      </div>

      {categories.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          <button
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${categoryId === "" ? "bg-brand2 text-white" : "bg-surface2 text-textDim"}`}
            onClick={() => setCategoryId("")}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${categoryId === c.id ? "bg-brand2 text-white" : "bg-surface2 text-textDim"}`}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-textDim text-sm">Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-textDim text-sm">No partner deals live yet — check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {products.map((p) => (
            <div key={p.id} className="card space-y-2">
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_url} alt={p.title} className="w-full h-40 object-contain bg-surface2 rounded-lg border border-border" />
              ) : (
                <div className="w-full h-40 rounded-lg border border-border flex items-center justify-center text-xs text-textFaint">No photo</div>
              )}
              <div>
                <div className="font-bold text-sm line-clamp-2">{p.title}</div>
                <div className="text-xs text-textDim">{p.categories?.name ?? "Uncategorised"} · via {p.advertiser_name}</div>
              </div>
              <div className="flex items-baseline gap-2">
                {typeof p.price_gbp === "number" && <span className="font-bold">£{p.price_gbp.toFixed(2)}</span>}
                {typeof p.rrp_gbp === "number" && typeof p.price_gbp === "number" && p.rrp_gbp > p.price_gbp && (
                  <span className="text-xs text-textFaint line-through">£{p.rrp_gbp.toFixed(2)}</span>
                )}
              </div>
              <a
                href={p.affiliate_url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="btn btn-primary w-full text-center text-xs"
              >
                Buy on {p.advertiser_name} →
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
