"use client";

import { useEffect, useState } from "react";

type Claim = {
  id: string;
  status: string;
  listedAt: string;
  listedAtOrBelowEstimate: boolean;
  offeredAtCostAfterWindow: boolean;
  filedAt: string;
  displayName: string;
  productName: string;
  itemPriceGBP: number | null;
  payoutPct: number | null;
  potentialPayoutGBP: number | null;
};

const STATUS_COLOR: Record<string, string> = {
  pending_window: "text-textDim",
  eligible: "text-gold",
  paid: "text-green",
  rejected: "text-red",
};

/**
 * Section 12.1 — Steven, 27 Aug 2026: "is buyback insurance setup? need to
 * do this if not." Every real claim, staff resolve the "eligible" ones —
 * approving pays out real wallet credit, see /api/admin/buyback-claims/[id]/resolve.
 */
export default function AdminBuybackClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("eligible");

  function load() {
    setLoading(true);
    fetch("/api/admin/buyback-claims")
      .then((r) => r.json())
      .then((d) => setClaims(d.claims ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function resolve(id: string, approve: boolean) {
    const reason = window.prompt(`Reason for ${approve ? "approving" : "rejecting"} this claim (goes into the audit log):`);
    if (reason === null) return;
    const res = await fetch(`/api/admin/buyback-claims/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data.error ?? "Something went wrong.");
      return;
    }
    if (approve) window.alert(`Approved — £${data.payoutGBP.toFixed(2)} paid to the shopper's wallet.`);
    load();
  }

  const filtered = filter === "all" ? claims : claims.filter((c) => c.status === filter);

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">
        Every real buyback claim, real data from <code>/api/admin/buyback-claims</code>. Approving pays out to the
        shopper's wallet immediately (Section 8.3) and writes to <code>admin_audit_log</code>.
      </p>
      <div className="flex gap-1">
        {["eligible", "pending_window", "paid", "rejected", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize ${filter === s ? "bg-brand text-bg" : "bg-surface2 text-textDim"}`}
          >
            {s.replace(/_/g, " ")}
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
                <th className="p-3">Shopper</th>
                <th className="p-3">Item</th>
                <th className="p-3">Status</th>
                <th className="p-3">Listed</th>
                <th className="p-3">Payout</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-bold">{c.displayName}</td>
                  <td className="p-3">{c.productName}</td>
                  <td className={`p-3 capitalize font-bold ${STATUS_COLOR[c.status] ?? ""}`}>{c.status.replace(/_/g, " ")}</td>
                  <td className="p-3 text-textDim">{new Date(c.listedAt).toLocaleDateString("en-GB")}</td>
                  <td className="p-3 font-bold">{c.potentialPayoutGBP !== null ? `£${c.potentialPayoutGBP.toFixed(2)}` : "—"}</td>
                  <td className="p-3 whitespace-nowrap space-x-2">
                    {c.status === "eligible" && (
                      <>
                        <button className="btn btn-primary text-xs px-2 py-1" onClick={() => resolve(c.id, true)}>
                          Approve
                        </button>
                        <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => resolve(c.id, false)}>
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-textDim">
                    No claims{filter !== "all" ? ` with status "${filter.replace(/_/g, " ")}"` : ""}.
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
