"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBasket } from "../BasketProvider";
import CategorySidebar from "../components/CategorySidebar";
import ShopperSwitch from "../components/ShopperSwitch";
import { SHOP_LOW_STOCK_THRESHOLD_UNITS } from "@flipsta/shared";

type ShopItem = {
  id: string;
  product_name: string;
  description: string | null;
  image_url: string | null;
  rrp_gbp: number;
  our_price_gbp: number;
  unitsAvailable: number;
  itemIds: string[];
  categories: { name: string } | null;
};

type Product = {
  id: string;
  title: string;
  condition: string;
  description: string | null;
  image_url: string | null;
  lowestPriceGBP: number | null;
  cheapestListingId: string | null;
  sellerCount: number;
};

type Category = { id: string; name: string; slug: string };

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
// 26 Aug 2026, Steven: "Does not need to say brought and shipped. Only
// needs to say shipped." — trimmed from the original broker-framing copy.
const FULFILLED_BY_RESELLER_NOTE =
  "Sourced by Flipsta, shipped by an independent Flipsta reseller once you order. Flipsta holds payment and handles support — for any issue with an order, raise it via Support rather than contacting the retailer.";

/**
 * 26 Aug 2026, Steven: "the RRP is to be displayed along with our price,
 * description and photos, should have a buy now button." These come from
 * discoverOpportunities.ts's shop_candidates path — a genuine retailer
 * discount the AI found but couldn't back with independent resale evidence.
 * Shown above "Sold by other sellers" below, which is the original
 * peer-to-peer pooled catalogue (Section 11.4) — a different,
 * already-working feature, still exactly as it was.
 *
 * 26 Aug 2026, Steven: "now you need to build all the features people have
 * come to expect from an online store. like catagories and basket and all
 * that jazz" — category filter pills, a live search (?q=, wired from the
 * header — see components/HeaderSearch.tsx), "Add to basket" and "Save"
 * (wishlist) buttons added to both sections below.
 */
export default function ShopPage() {
  return (
    <Suspense fallback={<p className="text-textDim text-sm">Loading…</p>}>
      <ShopPageInner />
    </Suspense>
  );
}

function ShopPageInner() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const initialCategory = searchParams.get("category");

  const [flipstaItems, setFlipstaItems] = useState<ShopItem[]>([]);
  const [flipstaLoading, setFlipstaLoading] = useState(true);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<ShopItem | null>(null);

  const [products, setProducts] = useState<Product[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategory);
  const [query, setQuery] = useState(initialQuery);
  // 26 Aug 2026: "who are you shopping for" — the selected shopper
  // profile's non-blank sizes, passed straight through to both catalogue
  // fetches as ?sizes=. Empty array (no profile picked, or none of its
  // fields are filled in) means no size filtering at all.
  const [sizes, setSizes] = useState<string[]>([]);

  // Maps "type:productName|price" -> wishlist row id, so a remove click can
  // target DELETE /api/wishlist/[id] without a second lookup round-trip.
  const [wishlistMap, setWishlistMap] = useState<Map<string, string>>(new Map());
  const [signedIn, setSignedIn] = useState(true);
  // 27 Aug 2026 — real trust-signal research (see
  // claude/deployment-checklist.md's #-5 section): product_name -> average
  // rating + review count, fetched once and looked up per card.
  const [reviewSummary, setReviewSummary] = useState<Record<string, { averageRating: number | null; count: number }>>({});

  const basket = useBasket();

  async function loadCatalogue(categorySlug: string | null, activeSizes: string[]) {
    setFlipstaLoading(true);
    const params = new URLSearchParams();
    if (categorySlug) params.set("category", categorySlug);
    if (activeSizes.length > 0) params.set("sizes", activeSizes.join(","));
    const qs = params.toString() ? `?${params.toString()}` : "";
    const [shopRes, productsRes] = await Promise.all([
      fetch(`/api/shop-items${qs}`).then((r) => r.json()),
      fetch(`/api/products${qs}`).then((r) => r.json()),
    ]);
    setFlipstaItems(shopRes.items ?? []);
    setProducts(productsRes.products ?? []);
    setFlipstaLoading(false);
  }

  // 26 Aug 2026, Steven: "i cant see the categories on the shop." The
  // original version of this effect swallowed any fetch failure silently —
  // the filter row would just never appear with no visible sign of why.
  // Now every outcome (loading / error / genuinely zero categories / real
  // data) renders something, so a real problem shows up as readable text
  // instead of a blank space that's indistinguishable from "nothing to see
  // here by design."
  useEffect(() => {
    fetch("/api/categories")
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `Server returned ${r.status}`);
        }
        return r.json();
      })
      .then((d) => setCategories(d.categories ?? []))
      .catch((err) => setCategoriesError(err.message ?? "Couldn't load categories."))
      .finally(() => setCategoriesLoading(false));
    loadWishlist();
    fetch("/api/product-reviews/summary")
      .then((r) => r.json())
      .then((d) => setReviewSummary(d.summary ?? {}))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCatalogue(selectedCategory, sizes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, sizes]);

  function loadWishlist() {
    fetch("/api/wishlist")
      .then(async (r) => {
        if (r.status === 401) {
          setSignedIn(false);
          return { items: [] };
        }
        return r.json();
      })
      .then((d) => {
        const map = new Map<string, string>();
        for (const w of d.items ?? []) map.set(`${w.item_type}:${w.product_name}|${w.price_gbp}`, w.id);
        setWishlistMap(map);
      });
  }

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
      loadCatalogue(selectedCategory, sizes);
    }
  }

  function addShopItemToBasket(item: ShopItem) {
    basket.addShopItem({
      itemIds: item.itemIds,
      productName: item.product_name,
      imageUrl: item.image_url,
      priceGBP: item.our_price_gbp,
      unitsAvailable: item.unitsAvailable,
    });
    setMessages((m) => ({ ...m, [item.id]: "Added to basket." }));
  }

  function addProductToBasket(p: Product) {
    if (!p.cheapestListingId || p.lowestPriceGBP == null) return;
    basket.addListing({
      listingId: p.cheapestListingId,
      productName: p.title,
      imageUrl: p.image_url,
      priceGBP: p.lowestPriceGBP,
    });
  }

  async function toggleWishlist(kind: "shop_item" | "product", item: ShopItem | Product) {
    if (!signedIn) {
      setMessages((m) => ({ ...m, wishlist: "Sign in to save items to your wishlist." }));
      return;
    }
    const productName = kind === "shop_item" ? (item as ShopItem).product_name : (item as Product).title;
    const priceGBP = kind === "shop_item" ? (item as ShopItem).our_price_gbp : (item as Product).lowestPriceGBP ?? 0;
    const key = `${kind}:${productName}|${priceGBP}`;
    const existingId = wishlistMap.get(key);
    if (existingId) {
      await fetch(`/api/wishlist/${existingId}`, { method: "DELETE" });
      setWishlistMap((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      return;
    }
    const body =
      kind === "shop_item"
        ? {
            itemType: "shop_item",
            shopItemId: (item as ShopItem).itemIds[0],
            productName,
            imageUrl: (item as ShopItem).image_url,
            priceGBP,
          }
        : {
            itemType: "product",
            productId: (item as Product).id,
            productName,
            imageUrl: (item as Product).image_url,
            priceGBP,
          };
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.item?.id) setWishlistMap((prev) => new Map(prev).set(key, data.item.id));
  }

  const filteredFlipstaItems = useMemo(() => {
    if (!query.trim()) return flipstaItems;
    const q = query.trim().toLowerCase();
    return flipstaItems.filter(
      (i) => i.product_name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q),
    );
  }, [flipstaItems, query]);

  const filteredProducts = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.trim().toLowerCase();
    return products.filter((p) => p.title.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q));
  }, [products, query]);

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <CategorySidebar
        categories={categories}
        categoriesLoading={categoriesLoading}
        categoriesError={categoriesError}
        selectedCategory={selectedCategory}
        onSelect={setSelectedCategory}
      />

      <div className="flex-1 min-w-0 space-y-10">
        <div>
          <h1 className="text-2xl font-bold">Shop</h1>
          <p className="text-textDim text-sm">Buy Flipsta Sourced deals, or from other Flipsta sellers, all in one place.</p>
        </div>

        {/* 26 Aug 2026, Steven: "Need a banner explaining this on the main
            page of the shop." — the "Flipsta It!" request-a-deal feature. */}
        <a
          href="/flipsta-it"
          className="block rounded-xl border border-brand2/40 bg-brand2/10 px-4 py-3 hover:border-brand2 transition"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <span className="font-bold">🔎 Can't find what you're after?</span>{" "}
              <span className="text-textDim text-sm">
                Tell us what you want and the most you'd pay — Flipsta It! and we'll go find it for you.
              </span>
            </div>
            <span className="text-xs font-bold text-brand2 whitespace-nowrap">Flipsta It! →</span>
          </div>
        </a>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this page's items…"
              className="w-full max-w-sm bg-surface2 border border-border rounded-full py-2 px-4 text-sm text-text placeholder:text-textFaint focus:outline-none focus:border-brand2"
            />
            <ShopperSwitch onSizesChange={setSizes} />
          </div>
          {messages.wishlist && <p className="text-xs text-gold">{messages.wishlist}</p>}
        </div>

        <section className="space-y-3">
        <div>
          <h2 className="font-bold text-lg">Flipsta Sourced Deals</h2>
          <p className="text-textDim text-sm">Genuine discounts off RRP. {FULFILLED_BY_RESELLER_NOTE}</p>
        </div>
        {flipstaLoading && <p className="text-textDim text-sm">Loading…</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredFlipstaItems.map((item) => {
            const discountPct = Math.round(((item.rrp_gbp - item.our_price_gbp) / item.rrp_gbp) * 100);
            const saved = wishlistMap.has(`shop_item:${item.product_name}|${item.our_price_gbp}`);
            return (
              <div key={item.id} className="card space-y-2">
                <div className="relative">
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
                        className="w-full h-36 object-contain bg-surface2 rounded-lg border border-border hover:opacity-90 transition"
                      />
                    ) : (
                      <div className="w-full h-36 rounded-lg border border-border flex items-center justify-center text-[10px] text-textFaint">
                        No photo
                      </div>
                    )}
                  </button>
                  <button
                    onClick={() => toggleWishlist("shop_item", item)}
                    aria-label={saved ? "Remove from wishlist" : "Save for later"}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-bg/80 border border-border flex items-center justify-center text-sm"
                  >
                    {saved ? "♥" : "♡"}
                  </button>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <button onClick={() => setExpanded(item)} className="font-bold text-sm text-left hover:underline">
                      {item.product_name}
                    </button>
                    <div className="text-xs text-textDim">{item.categories?.name}</div>
                  </div>
                  {/* 27 Aug 2026: real urgency, not invented — unitsAvailable is
                      the actual count of unsold shop_items rows for this
                      product (see api/shop-items/route.ts's grouping). Below
                      the threshold it's a genuine "hurry" signal, worth
                      calling out; above it, it's just informational. See
                      the CMA/ICO dark-patterns research in
                      claude/deployment-checklist.md's #-5 section for why
                      this must always stay a true count. */}
                  {item.unitsAvailable <= SHOP_LOW_STOCK_THRESHOLD_UNITS ? (
                    <span className="text-[10px] font-bold text-white bg-red rounded-full px-2 py-0.5 shrink-0">
                      Only {item.unitsAvailable} left
                    </span>
                  ) : (
                    <span className="text-[10px] text-textDim border border-border rounded-full px-2 py-0.5 shrink-0">
                      {item.unitsAvailable} available
                    </span>
                  )}
                </div>
                {reviewSummary[item.product_name] && reviewSummary[item.product_name].count > 0 && (
                  <div className="text-xs text-gold">
                    {"★".repeat(Math.round(reviewSummary[item.product_name].averageRating ?? 0))}
                    {"☆".repeat(5 - Math.round(reviewSummary[item.product_name].averageRating ?? 0))}
                    <span className="text-textDim ml-1">
                      {reviewSummary[item.product_name].averageRating} ({reviewSummary[item.product_name].count})
                    </span>
                  </div>
                )}
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
                <div className="flex gap-2">
                  <button
                    onClick={() => addShopItemToBasket(item)}
                    className="flex-1 text-xs font-bold border border-border rounded-lg py-1.5 hover:border-brand2"
                  >
                    Add to basket
                  </button>
                  <button
                    onClick={() => setExpanded(item)}
                    className="flex-1 text-xs font-bold border border-border rounded-lg py-1.5 hover:border-brand2"
                  >
                    View details
                  </button>
                </div>

                {messages[item.id] && <div className="text-xs text-textDim">{messages[item.id]}</div>}
              </div>
            );
          })}
          {!flipstaLoading && filteredFlipstaItems.length === 0 && (
            <p className="text-textDim text-sm col-span-full">No Flipsta Sourced deals match right now — check back soon.</p>
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
          {filteredProducts.map((p) => {
            const saved = wishlistMap.has(`product:${p.title}|${p.lowestPriceGBP ?? 0}`);
            return (
              <div key={p.id} className="card space-y-1">
                <div className="relative">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt={p.title} className="w-full h-32 object-contain bg-surface2 rounded-lg border border-border mb-1" />
                  ) : (
                    <div className="w-full h-32 rounded-lg border border-border mb-1 flex items-center justify-center text-[10px] text-textFaint">
                      No photo
                    </div>
                  )}
                  <button
                    onClick={() => toggleWishlist("product", p)}
                    aria-label={saved ? "Remove from wishlist" : "Save for later"}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-bg/80 border border-border flex items-center justify-center text-sm"
                  >
                    {saved ? "♥" : "♡"}
                  </button>
                </div>
                <div className="font-bold text-sm">{p.title}</div>
                <div className="text-xs text-textDim">{p.condition}</div>
                {p.description && <div className="text-xs text-textDim line-clamp-2">{p.description}</div>}
                <div className="text-lg font-extrabold">
                  {p.lowestPriceGBP ? `from £${p.lowestPriceGBP.toFixed(2)}` : "No sellers yet"}
                </div>
                <div className="text-xs text-textDim">{p.sellerCount} seller(s)</div>
                {p.cheapestListingId && (
                  <button
                    onClick={() => addProductToBasket(p)}
                    className="w-full text-xs font-bold border border-border rounded-lg py-1.5 hover:border-brand2 mt-1"
                  >
                    Add to basket
                  </button>
                )}
              </div>
            );
          })}
          {filteredProducts.length === 0 && <p className="text-textDim text-sm col-span-full">No peer listings match right now.</p>}
        </div>
      </section>
      </div>

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
              <img src={expanded.image_url} alt={expanded.product_name} className="w-full h-64 object-contain bg-surface2 rounded-lg border border-border" />
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
            <button
              onClick={() => addShopItemToBasket(expanded)}
              className="w-full text-xs font-bold border border-border rounded-lg py-1.5 hover:border-brand2"
            >
              Add to basket
            </button>
            {messages[expanded.id] && <div className="text-xs text-textDim">{messages[expanded.id]}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
