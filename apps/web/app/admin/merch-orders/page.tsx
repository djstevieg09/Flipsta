"use client";

import { useEffect, useState } from "react";

type MerchOrder = {
  id: string;
  buyerDisplayName: string;
  buyerEmail: string | null;
  itemId: string;
  itemName: string;
  size: string | null;
  quantity: number;
  priceGBP: number;
  shippingGBP: number;
  shippingName: string | null;
  shippingAddress: {
    line1?: string;
    line2?: string;
    city?: string;
    postal_code?: string;
    country?: string;
  } | null;
  status: "pending" | "shipped" | "cancelled";
  createdAt: string;
  shippedAt: string | null;
};

/**
 * 18 Sept 2026, Steven: "need to add a merch tab on the main landing page
 * with tshirts, caps and other items that people can buy." This is where
 * a paid order actually gets fulfilled from — real data from
 * /api/admin/merch-orders. Without this page a merch purchase would take
 * real money with nowhere for Steven to see what to pack and post.
 */
export default function AdminMerchOrdersPage() {
  const [orders, setOrders] = useState<MerchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "shipped" | "cancelled">("pending");

  function load() {
    setLoading(true);
    fetch("/api/admin/merch-orders")
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function setStatus(order: MerchOrder, status: MerchOrder["status"]) {
    if (status === "cancelled" && !window.confirm(`Mark this ${order.itemName} order for ${order.buyerDisplayName} as cancelled?`)) {
      return;
    }
    setBusyId(order.id);
    const res = await fetch("/api/admin/merch-orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id, status }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error ?? "Something went wrong.");
      return;
    }
    load();
  }

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  function formatAddress(o: MerchOrder) {
    if (!o.shippingAddress) return "No address on file";
    const a = o.shippingAddress;
    return [a.line1, a.line2, a.city, a.postal_code, a.country].filter(Boolean).join(", ");
  }

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">
        Every paid merch order, real data from <code>/api/admin/merch-orders</code>. Mark an order shipped once it&apos;s
        packed and posted — that&apos;s recorded in the Audit Log (Section 12.1).
      </p>
      <div className="flex gap-1 text-xs">
        {(["pending", "shipped", "cancelled", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg border ${filter === f ? "bg-gold text-black border-gold font-bold" : "border-border hover:bg-surface2"}`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-textDim text-sm">Loading…</p>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-textDim text-xs uppercase border-b border-border">
                <th className="p-3">Buyer</th>
                <th className="p-3">Item</th>
                <th className="p-3">Ship to</th>
                <th className="p-3">Total</th>
                <th className="p-3">Status</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <div className="font-bold">{o.buyerDisplayName}</div>
                    <div className="text-xs text-textDim">{o.buyerEmail ?? "—"}</div>
                  </td>
                  <td className="p-3">
                    <div className="font-bold">
                      {o.itemName}
                      {o.size ? ` (${o.size})` : ""} × {o.quantity}
                    </div>
                    <div className="text-xs text-textDim">{new Date(o.createdAt).toLocaleDateString("en-GB")}</div>
                  </td>
                  <td className="p-3 text-xs max-w-[220px]">
                    <div className="font-bold">{o.shippingName ?? "—"}</div>
                    <div className="text-textDim">{formatAddress(o)}</div>
                  </td>
                  <td className="p-3 font-bold">£{(o.priceGBP * o.quantity + o.shippingGBP).toFixed(2)}</td>
                  <td className="p-3 capitalize">{o.status}</td>
                  <td className="p-3">
                    <div className="flex gap-1 whitespace-nowrap">
                      {o.status !== "shipped" && (
                        <button
                          className="btn btn-ghost text-xs px-2 py-1"
                          disabled={busyId === o.id}
                          onClick={() => setStatus(o, "shipped")}
                        >
                          Mark shipped
                        </button>
                      )}
                      {o.status === "pending" && (
                        <button
                          className="btn btn-ghost text-xs px-2 py-1 text-red"
                          disabled={busyId === o.id}
                          onClick={() => setStatus(o, "cancelled")}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-textDim">
                    No orders match.
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
