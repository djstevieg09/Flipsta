"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * 26 Aug 2026, Steven: "now you need to build all the features people have
 * come to expect from an online store. like catagories and basket and all
 * that jazz." Scoped via AskUserQuestion — Steven confirmed "one click,
 * several linked charges" over a single combined Stripe charge, meaning the
 * basket needs NO new payment/escrow architecture: checkout just calls the
 * existing per-item purchase endpoints (POST /api/shop-items, POST
 * /api/orders) once per line item, each still going through its own
 * existing escrow flow exactly as it does today when bought individually.
 *
 * That's why this is a client-side Context + localStorage, not a server
 * table — the basket itself never needs to be authoritative or shared
 * across devices, it's just a shopping list that gets replayed as a
 * sequence of real purchase calls at checkout.
 */
export type BasketLine = {
  key: string;
  kind: "shop_item" | "listing";
  itemIds?: string[]; // shop_item only — pool of available row ids for this product/price group, snapshotted when added
  listingId?: string; // listing only
  productName: string;
  imageUrl: string | null;
  priceGBP: number;
  quantity: number;
  maxQuantity: number; // unitsAvailable for a shop item; always 1 for a peer listing (one seller, one unit)
};

type BasketContextValue = {
  lines: BasketLine[];
  addShopItem: (item: { itemIds: string[]; productName: string; imageUrl: string | null; priceGBP: number; unitsAvailable: number }) => void;
  addListing: (item: { listingId: string; productName: string; imageUrl: string | null; priceGBP: number }) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
  count: number;
};

const BasketContext = createContext<BasketContextValue | null>(null);

const STORAGE_KEY = "flipsta_basket_v1";

export function BasketProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<BasketLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount only — reading it during the
  // initial render would desync from Next's server-rendered markup (the
  // server has no localStorage) and trigger a hydration mismatch.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {
      // Corrupt or inaccessible storage — start with an empty basket rather than crash.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // don't stomp real stored contents with the initial empty array before hydration runs
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Storage full or unavailable (private browsing) — basket still works for this page load.
    }
  }, [lines, hydrated]);

  function addShopItem(item: { itemIds: string[]; productName: string; imageUrl: string | null; priceGBP: number; unitsAvailable: number }) {
    const key = `shop:${item.productName}|${item.priceGBP}`;
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        const nextQty = Math.min(existing.quantity + 1, item.unitsAvailable);
        return prev.map((l) => (l.key === key ? { ...l, quantity: nextQty, itemIds: item.itemIds, maxQuantity: item.unitsAvailable } : l));
      }
      return [
        ...prev,
        {
          key,
          kind: "shop_item" as const,
          itemIds: item.itemIds,
          productName: item.productName,
          imageUrl: item.imageUrl,
          priceGBP: item.priceGBP,
          quantity: 1,
          maxQuantity: item.unitsAvailable,
        },
      ];
    });
  }

  function addListing(item: { listingId: string; productName: string; imageUrl: string | null; priceGBP: number }) {
    const key = `listing:${item.listingId}`;
    setLines((prev) => {
      if (prev.some((l) => l.key === key)) return prev; // peer listing is a single unique unit — nothing to increment
      return [
        ...prev,
        {
          key,
          kind: "listing" as const,
          listingId: item.listingId,
          productName: item.productName,
          imageUrl: item.imageUrl,
          priceGBP: item.priceGBP,
          quantity: 1,
          maxQuantity: 1,
        },
      ];
    });
  }

  function updateQuantity(key: string, quantity: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(quantity, l.maxQuantity)) } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function clear() {
    setLines([]);
  }

  const count = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <BasketContext.Provider value={{ lines, addShopItem, addListing, updateQuantity, removeLine, clear, count }}>
      {children}
    </BasketContext.Provider>
  );
}

export function useBasket() {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error("useBasket must be used within a BasketProvider");
  return ctx;
}
