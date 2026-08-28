"use client";

import { useEffect, useState } from "react";

type Category = { id: string; name: string; slug: string };
type StockItem = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  condition: string;
  price_gbp: number;
  quantity: number;
  is_recurring: boolean;
  categories: { name: string } | null;
};

/**
 * 28 Aug 2026, Steven: "need an option in the sellers dashboard to add own
 * stock they have for sale. have a tick box if they want to save it for
 * recurring stock." A seller's own private inventory catalog, independent
 * of the AI opportunities pipeline — see migration 0029's comment for the
 * real gap this closes (there was previously no way to list something
 * self-sourced at all). Listing a stock item (the "List it" button below)
 * calls the same POST /api/listings every other listing goes through, just
 * with stockItemId instead of opportunityId — so it becomes a normal
 * marketplace listing, pickable into a live show exactly like any other.
 */
export default function SellStockPage() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [condition, setCondition] = useState("Used");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [isRecurring, setIsRecurring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [listPrice, setListPrice] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    fetch("/api/seller-stock")
      .then((r) => r.json())
      .then((d) => setStock(d.stock ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
  }, []);

  async function addStock() {
    if (!title.trim() || !price) {
      setMessage("Title and price are required.");
      return;
    }
    const res = await fetch("/api/seller-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        categoryId: categoryId || undefined,
        condition,
        priceGBP: Number(price),
        quantity: Number(quantity),
        isRecurring,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error);
      return;
    }
    setTitle("");
    setDescription("");
    setImageUrl("");
    setPrice("");
    setQuantity("1");
    setIsRecurring(false);
    setMessage("Added to your stock.");
    load();
  }

  async function listItem(item: StockItem) {
    const priceOverride = listPrice[item.id];
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stockItemId: item.id,
        priceGBP: priceOverride ? Number(priceOverride) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error);
      return;
    }
    setMessage(`Listed "${item.title}" on the marketplace.`);
    load();
  }

  async function removeStock(id: string) {
    if (!window.confirm("Remove this stock item? This won't affect anything already listed.")) return;
    await fetch(`/api/seller-stock/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Stock</h1>
        <p className="text-textDim text-sm">
          Add items you already have on hand to sell — no AI opportunity needed. "List it" turns a stock item into a
          real marketplace listing, which you can then queue into a live show.
        </p>
      </div>

      <div className="card p-4 space-y-3">
        <p className="text-xs font-bold text-textDim uppercase">Add stock</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Image URL (optional)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm">
            <option value="">Category (optional)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={condition} onChange={(e) => setCondition(e.target.value)} className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm">
            <option>New</option>
            <option>Like new</option>
            <option>Used</option>
          </select>
          <input type="number" min="0.01" step="0.01" placeholder="Price (£)" value={price} onChange={(e) => setPrice(e.target.value)} className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" />
          <input type="number" min="0" step="1" placeholder="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" rows={2} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
          Save as recurring stock (a template I'll restock and sell again)
        </label>
        {message && <p className="text-sm text-brand">{message}</p>}
        <button className="btn btn-primary text-sm px-4 py-2" onClick={addStock}>
          Add to stock
        </button>
      </div>

      {loading ? (
        <p className="text-textDim text-sm">Loading…</p>
      ) : stock.length === 0 ? (
        <p className="text-textDim text-sm">No stock added yet.</p>
      ) : (
        <div className="space-y-3">
          {stock.map((item) => (
            <div key={item.id} className="card p-4 flex flex-wrap items-center gap-3 justify-between">
              <div>
                <p className="font-bold">
                  {item.title} {item.is_recurring && <span className="text-xs text-textDim">(recurring)</span>}
                </p>
                <p className="text-xs text-textDim">
                  {item.categories?.name ?? "Uncategorized"} · {item.condition} · £{item.price_gbp} · {item.quantity} in stock
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder={`£${item.price_gbp}`}
                  value={listPrice[item.id] ?? ""}
                  onChange={(e) => setListPrice((p) => ({ ...p, [item.id]: e.target.value }))}
                  className="w-24 bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs"
                />
                <button className="btn btn-primary text-xs px-3 py-1.5" onClick={() => listItem(item)} disabled={item.quantity <= 0}>
                  List it
                </button>
                <button className="btn btn-ghost text-xs px-3 py-1.5" onClick={() => removeStock(item.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
