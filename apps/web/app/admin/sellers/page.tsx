"use client";

import { useEffect, useState } from "react";

type Seller = {
  id: string;
  displayName: string;
  subscriptionTier: string;
  role: string;
  status: string;
  createdAt: string;
  openTickets: number;
};

export default function AdminSellersPage() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/admin/sellers")
      .then((r) => r.json())
      .then((d) => setSellers(d.sellers ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function updateSeller(id: string, body: Record<string, unknown>) {
    const reason = window.prompt("Reason for this change (goes into the audit log):");
    if (reason === null) return;
    await fetch(`/api/admin/sellers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, reason }),
    });
    load();
  }

  const filtered = sellers.filter((s) => s.displayName.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">
        Every profile, real data from <code>/api/admin/sellers</code>. Tier override and suspend both write to{" "}
        <code>admin_audit_log</code> (Section 12.1).
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
                <th className="p-3">Seller</th>
                <th className="p-3">Tier</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">Open tickets</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-bold">{s.displayName}</td>
                  <td className="p-3 capitalize">{s.subscriptionTier}</td>
                  <td className="p-3 capitalize">{s.role}</td>
                  <td className="p-3 capitalize">{s.status}</td>
                  <td className="p-3">{s.openTickets}</td>
                  <td className="p-3 space-x-2 whitespace-nowrap">
                    <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => updateSeller(s.id, { subscriptionTier: "elite" })}>
                      Override -&gt; Elite
                    </button>
                    <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => updateSeller(s.id, { status: "suspended" })}>
                      Suspend
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-textDim">
                    No sellers match.
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
