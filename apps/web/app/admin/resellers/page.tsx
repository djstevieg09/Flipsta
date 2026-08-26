"use client";

import { useEffect, useState } from "react";

type Reseller = {
  id: string;
  displayName: string;
  subscriptionTier: string;
  status: string;
  createdAt: string;
  claimsTotal: number;
  delivered: number;
  activeClaims: number;
  earnedGBP: number;
};

/**
 * 26 Aug 2026, Steven: "need to be able to manage resellers from this
 * panel." Separate from /admin/sellers (every profile — generic tier,
 * status, tickets) — this is specifically Pro/Elite fulfillment activity:
 * who's claiming jobs, delivering them, and what they've earned, backed by
 * GET /api/admin/resellers.
 */
export default function AdminResellersPage() {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/resellers")
      .then((r) => r.json())
      .then((d) => setResellers(d.resellers ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = resellers.filter((r) => r.displayName.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">
        Every Pro/Elite member and their real fulfillment activity — claims, deliveries, and what they've actually
        earned (reward + reimbursement, paid out on delivery confirmation). For generic tier/status/ticket management
        across every profile, see <code>/admin/sellers</code> instead.
      </p>
      <input
        type="text"
        placeholder="Search by name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm w-64"
      />
      {loading ? (
        <p className="text-textDim text-sm">Loading…</p>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-textDim text-xs uppercase border-b border-border">
                <th className="p-3">Reseller</th>
                <th className="p-3">Tier</th>
                <th className="p-3">Status</th>
                <th className="p-3">Active claims</th>
                <th className="p-3">Delivered</th>
                <th className="p-3">Total claims</th>
                <th className="p-3">Earned</th>
                <th className="p-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-bold">{r.displayName}</td>
                  <td className="p-3 capitalize">{r.subscriptionTier}</td>
                  <td className="p-3 capitalize">{r.status}</td>
                  <td className="p-3">{r.activeClaims}</td>
                  <td className="p-3">{r.delivered}</td>
                  <td className="p-3">{r.claimsTotal}</td>
                  <td className="p-3 font-bold text-green">£{r.earnedGBP.toFixed(2)}</td>
                  <td className="p-3 text-textDim">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-textDim">
                    No Pro/Elite members yet.
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
