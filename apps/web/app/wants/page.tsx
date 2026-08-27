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
  // 27 Aug 2026, Steven: "buyer wants should not be a thing for someone who
  // hasnt signed in yet" — /api/wants itself has no auth check (it's a
  // public read), so the gate has to happen here, same signed-in check
  // /api/me already backs elsewhere (see wallet/page.tsx's `signedIn`).
  const [signedIn, setSignedIn] = useState(true);
  const [checkedAuth, setCheckedAuth] = useState(false);

  function load() {
    fetch("/api/wants")
      .then((r) => r.json())
      .then((d) => setWants(d.wants ?? []));
  }

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setSignedIn(Boolean(d.profile)))
      .finally(() => setCheckedAuth(true));
    load();
  }, []);

  if (checkedAuth && !signedIn) {
    return (
      <p className="text-textDim text-sm">
        <a className="underline" href="/login">Sign in</a> to see Buyer Wants.
      </p>
    );
  }

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
