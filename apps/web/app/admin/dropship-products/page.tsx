"use client";

import { useEffect, useState } from "react";

type Category = { id: string; name: string };
type DropshipProduct = {
  id: string;
  ali_product_url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  source_price_gbp: number;
  our_price_gbp: number;
  category_id: string | null;
  is_active: boolean;
  created_at: string;
  categories: { name: string } | null;
};

const EMPTY_FORM = {
  aliProductUrl: "",
  title: "",
  description: "",
  imageUrl: "",
  sourcePriceGBP: "",
  ourPriceGBP: "",
  categoryId: "",
};

/**
 * 18 Sept 2026, Steven: "now i need you to find a way to add ali express
 * products and add them into our shop with a 25% markup and when someone
 * orders it then a dropship order is created." This is where a product
 * actually gets added — paste the AliExpress product page URL, fill in
 * the title/photo/price, and it appears on /shop's "AliExpress Finds"
 * section. AliExpress's own APIs need their own developer-portal signup +
 * approval (same external gate as eBay/Etsy) and, per DSers' own docs,
 * still can't automate the AliExpress checkout step even once approved —
 * so this manual-entry flow is what actually works today, not a
 * placeholder for a future automated feed sync (see migration
 * 0033_dropship_products.sql's comment for the full reasoning).
 */
export default function AdminDropshipProductsPage() {
  const [products, setProducts] = useState<DropshipProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/dropship-products").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ])
      .then(([productsRes, categoriesRes]) => {
        setProducts(productsRes.products ?? []);
        setCategories(categoriesRes.categories ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const suggestedPrice = (() => {
    const n = Number(form.sourcePriceGBP);
    return Number.isFinite(n) && n > 0 ? (n * 1.25).toFixed(2) : "";
  })();

  async function addProduct() {
    setError(null);
    if (!form.aliProductUrl.trim() || !form.title.trim() || !form.sourcePriceGBP) {
      setError("The AliExpress URL, a title, and the source price are required.");
      return;
    }
    setAdding(true);
    const res = await fetch("/api/admin/dropship-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aliProductUrl: form.aliProductUrl,
        title: form.title,
        description: form.description || undefined,
        imageUrl: form.imageUrl || undefined,
        sourcePriceGBP: Number(form.sourcePriceGBP),
        ourPriceGBP: form.ourPriceGBP ? Number(form.ourPriceGBP) : undefined,
        categoryId: form.categoryId || undefined,
      }),
    });
    setAdding(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't add that product.");
      return;
    }
    setForm(EMPTY_FORM);
    load();
  }

  async function toggleActive(p: DropshipProduct) {
    setBusyId(p.id);
    await fetch("/api/admin/dropship-products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: p.id, isActive: !p.is_active }),
    });
    setBusyId(null);
    load();
  }

  async function updatePrice(p: DropshipProduct, newPrice: string) {
    const n = Number(newPrice);
    if (!Number.isFinite(n) || n <= 0) return;
    setBusyId(p.id);
    await fetch("/api/admin/dropship-products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: p.id, ourPriceGBP: n }),
    });
    setBusyId(null);
    load();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold">Dropship Products — AliExpress</h1>
        <p className="text-textDim text-sm">
          Add a product by pasting its AliExpress page URL and filling in the details below — it appears on /shop
          with the markup applied. When a customer buys one, it lands in{" "}
          <a href="/admin/dropship-orders" className="underline">
            Dropship Orders
          </a>{" "}
          for you to actually go and place (and pay for) on AliExpress.
        </p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-bold text-sm">Add a product</h2>
        {error && <p className="text-red text-sm">{error}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs font-bold text-textDim sm:col-span-2">
            AliExpress product URL
            <input
              type="text"
              value={form.aliProductUrl}
              onChange={(e) => setForm((f) => ({ ...f, aliProductUrl: e.target.value }))}
              placeholder="https://www.aliexpress.com/item/..."
              className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text"
            />
          </label>
          <label className="text-xs font-bold text-textDim sm:col-span-2">
            Title
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text"
            />
          </label>
          <label className="text-xs font-bold text-textDim sm:col-span-2">
            Description (optional)
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text"
            />
          </label>
          <label className="text-xs font-bold text-textDim sm:col-span-2">
            Image URL (optional)
            <input
              type="text"
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              placeholder="https://..."
              className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text"
            />
          </label>
          <label className="text-xs font-bold text-textDim">
            AliExpress price (£)
            <input
              type="number"
              step="0.01"
              value={form.sourcePriceGBP}
              onChange={(e) => setForm((f) => ({ ...f, sourcePriceGBP: e.target.value }))}
              className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text"
            />
          </label>
          <label className="text-xs font-bold text-textDim">
            Our price (£) — 25% markup suggested{suggestedPrice ? `: £${suggestedPrice}` : ""}
            <input
              type="number"
              step="0.01"
              value={form.ourPriceGBP}
              onChange={(e) => setForm((f) => ({ ...f, ourPriceGBP: e.target.value }))}
              placeholder={suggestedPrice ? `£${suggestedPrice}` : "auto"}
              className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text"
            />
          </label>
          <label className="text-xs font-bold text-textDim sm:col-span-2">
            Category (optional)
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="mt-1 w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text"
            >
              <option value="">Uncategorised</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button onClick={addProduct} disabled={adding} className="btn btn-primary disabled:opacity-60">
          {adding ? "Adding…" : "Add product"}
        </button>
      </div>

      {loading ? (
        <p className="text-textDim text-sm">Loading…</p>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-textDim text-xs uppercase border-b border-border">
                <th className="p-3">Product</th>
                <th className="p-3">AliExpress price</th>
                <th className="p-3">Our price</th>
                <th className="p-3">Category</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="p-3 max-w-[260px]">
                    <a href={p.ali_product_url} target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">
                      {p.title}
                    </a>
                  </td>
                  <td className="p-3">£{p.source_price_gbp.toFixed(2)}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={p.our_price_gbp}
                      onBlur={(e) => e.target.value !== String(p.our_price_gbp) && updatePrice(p, e.target.value)}
                      disabled={busyId === p.id}
                      className="w-20 bg-surface2 border border-border rounded-lg px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="p-3 text-textDim">{p.categories?.name ?? "—"}</td>
                  <td className="p-3">{p.is_active ? "Active" : "Inactive"}</td>
                  <td className="p-3">
                    <button
                      className="btn btn-ghost text-xs px-2 py-1"
                      disabled={busyId === p.id}
                      onClick={() => toggleActive(p)}
                    >
                      {p.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-textDim">
                    No products added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
