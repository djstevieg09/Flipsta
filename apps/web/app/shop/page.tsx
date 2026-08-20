"use client";

import { useEffect, useState } from "react";

type Product = {
  id: string;
  title: string;
  condition: string;
  lowestPriceGBP: number | null;
  sellerCount: number;
};

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Shop</h1>
      <p className="text-textDim text-sm">
        Pooled lowest-ask pricing per product, computed from real <code>listings</code> rows via{" "}
        <code>/api/products</code> and <code>/api/listings</code> (Section 11.4 price-time priority).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {products.map((p) => (
          <div key={p.id} className="card space-y-1">
            <div className="font-bold text-sm">{p.title}</div>
            <div className="text-xs text-textDim">{p.condition}</div>
            <div className="text-lg font-extrabold">
              {p.lowestPriceGBP ? `from £${p.lowestPriceGBP.toFixed(2)}` : "No sellers yet"}
            </div>
            <div className="text-xs text-textDim">{p.sellerCount} seller(s)</div>
          </div>
        ))}
      </div>
    </div>
  );
}
