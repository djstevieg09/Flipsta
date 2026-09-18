"use client";

import { useEffect, useState } from "react";

type DropshipOrder = {
  id: string;
  buyerDisplayName: string;
  buyerEmail: string | null;
  productTitle: string;
  productImageUrl: string | null;
  aliProductUrl: string | null;
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
  status: "pending" | "ordered" | "shipped" | "cancelled";
  aliOrderId: string | null;
  trackingNumber: string | null;
  orderedAt: string | null;
  shippedAt: string | null;
  createdAt: string;
};

/**
 * 18 Sept 2026, Steven: "when someone orders it then a dropship order is
 * created." This is where a paid order actually gets fulfilled from —
 * real data from /api/admin/dropship-orders (migration 0033). Since
 * paying AliExpress can't be automated (confirmed against DSers' own
 * docs — even the official tooling needs a human to click "pay" on
 * AliExpress's own checkout), the workflow here is: 1) copy the
 * shipping address below, 2) go place and pay for the matching order on
 * AliExpress yourself, using that address, 3) mark it "Ordered" here
 * (optionally noting AliExpress's own order id), 4) once AliExpress ships
 * it, mark "Shipped" with the tracking number.
 */
export default function AdminDropshipOrdersPage() {
  const [orders, setOrders] = useState<DropshipOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "ordered" | "shipped" | "cancelled">("pending");
  const [aliOrderIdDraft, setAliOrderIdDraft] = useState<Record<string, string>>({});
  const [trackingDraft, setTrackingDraft] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    fetch("/api/admin/dropship-orders")
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function setStatus(order: DropshipOrder, status: DropshipOrder["status"]) {
    if (status === "cancelled" && !window.confirm(`Mark this order for ${order.buyerDisplayName} as cancelled?`)) {
      return;
    }
    setBusyId(order.id);
    const res = await fetch("/api/admin/dropship-orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        status,
        aliOrderId: status === "ordered" ? aliOrderIdDraft[order.id] : undefined,
        trackingNumber: status === "shipped" ? trackingDraft[order.id] : undefined,
      }),
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

  function formatAddress(o: DropshipOrder) {
    if (!o.shippingAddress) return "No address on file";
    const a = o.shippingAddress;
    return [a.line1, a.line2, a.city, a.postal_code, a.country].filter(Boolean).join(", ");
  }

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">
        Every paid dropship order, real data from <code>/api/admin/dropship-orders</code>. Place and pay for each
        one on AliExpress yourself using the shipping address shown, then mark it Ordered — and Shipped once
        AliExpress gives you tracking.
      </p>
      <div className="flex gap-1 text-xs">
        {(["pending", "ordered", "shipped", "cancelled", "all"] as const).map((f) => (
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
                  <td className="p-3 max-w-[220px]">
                    <div className="font-bold">
                      {o.productTitle} × {o.quantity}
                    </div>
                    {o.aliProductUrl && (
                      <a href={o.aliProductUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand2 underline">
                        Open on AliExpress
                      </a>
                    )}
                    <div className="text-xs text-textDim">{new Date(o.createdAt).toLocaleDateString("en-GB")}</div>
                    {o.aliOrderId && <div className="text-xs text-textDim">AliExpress order: {o.aliOrderId}</div>}
                    {o.trackingNumber && <div className="text-xs text-textDim">Tracking: {o.trackingNumber}</div>}
                  </td>
                  <td className="p-3 text-xs max-w-[220px]">
                    <div className="font-bold">{o.shippingName ?? "—"}</div>
                    <div className="text-textDim">{formatAddress(o)}</div>
                  </td>
                  <td className="p-3 font-bold">£{(o.priceGBP * o.quantity + o.shippingGBP).toFixed(2)}</td>
                  <td className="p-3 capitalize">{o.status}</td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1.5 whitespace-nowrap">
                      {o.status === "pending" && (
                        <>
                          <input
                            type="text"
                            placeholder="AliExpress order id (optional)"
                            value={aliOrderIdDraft[o.id] ?? ""}
                            onChange={(e) => setAliOrderIdDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                            className="bg-surface2 border border-border rounded-lg px-2 py-1 text-xs w-44"
                          />
                          <button
                            className="btn btn-ghost text-xs px-2 py-1"
                            disabled={busyId === o.id}
                            onClick={() => setStatus(o, "ordered")}
                          >
                            Mark ordered
                          </button>
                        </>
                      )}
                      {o.status === "ordered" && (
                        <>
                          <input
                            type="text"
                            placeholder="Tracking number"
                            value={trackingDraft[o.id] ?? ""}
                            onChange={(e) => setTrackingDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                            className="bg-surface2 border border-border rounded-lg px-2 py-1 text-xs w-44"
                          />
                          <button
                            className="btn btn-ghost text-xs px-2 py-1"
                            disabled={busyId === o.id}
                            onClick={() => setStatus(o, "shipped")}
                          >
                            Mark shipped
                          </button>
                        </>
                      )}
                      {(o.status === "pending" || o.status === "ordered") && (
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
