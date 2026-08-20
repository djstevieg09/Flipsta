"use client";

import { useEffect, useState } from "react";

type Want = {
  id: string;
  item_description: string;
  max_price_gbp: number;
  ranked_offers: { id: string; sellerId: string; offerPriceGBP: number }[];
};

export default function WantsPage() {
  const [wants, setWants] = useState<Want[]>([]);

  function load() {
    fetch("/api/wants")
      .then((r) => r.json())
      .then((d) => setWants(d.wants ?? []));
  }

  useEffect(load, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Buyer Wants</h1>
      <p className="text-textDim text-sm">
        Section 11.10's reverse auction, backed by real <code>buyer_wants</code> / <code>want_offers</code> rows.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {wants.map((w) => (
          <div key={w.id} className="card space-y-2">
            <div className="font-bold text-sm">{w.item_description}</div>
            <div className="text-xs text-textDim">Max £{w.max_price_gbp}</div>
            {w.ranked_offers.length === 0 && <div className="text-xs text-textDim">No offers yet.</div>}
            {w.ranked_offers.map((o, i) => (
              <div key={o.id} className={`text-xs flex justify-between ${i === 0 ? "text-green font-bold" : "text-textFaint line-through"}`}>
                <span>Offer</span>
                <span>£{o.offerPriceGBP}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
