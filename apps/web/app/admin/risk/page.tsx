"use client";

import { useEffect, useState } from "react";

type RiskFlag = {
  id: string;
  type: string;
  severity: string;
  sellerName: string;
  detail: string;
  status: string;
  createdAt: string;
};

export default function AdminRiskPage() {
  const [flags, setFlags] = useState<RiskFlag[]>([]);

  function load() {
    fetch("/api/admin/risk-flags")
      .then((r) => r.json())
      .then((d) => setFlags((d.riskFlags ?? []).filter((f: RiskFlag) => f.status !== "dismissed")));
  }

  useEffect(load, []);

  async function act(id: string, status: string) {
    await fetch(`/api/admin/risk-flags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">
        Concentration-risk (Section 8.4) and buyback-abuse (Section 11.6) flags, written by{" "}
        <code>apps/worker/src/jobs/flagRiskSignals.ts</code> for a human to review — never auto-actioned.
      </p>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-textDim text-xs uppercase border-b border-border">
              <th className="p-3">Severity</th>
              <th className="p-3">Type</th>
              <th className="p-3">Seller</th>
              <th className="p-3">Detail</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${f.severity === "high" ? "bg-red" : f.severity === "medium" ? "bg-gold" : "bg-brand"}`} />
                  <span className="capitalize">{f.severity}</span>
                </td>
                <td className="p-3">{f.type.replace(/_/g, " ")}</td>
                <td className="p-3 font-bold">{f.sellerName}</td>
                <td className="p-3 text-textDim">{f.detail}</td>
                <td className="p-3 space-x-2 whitespace-nowrap">
                  <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => act(f.id, "investigating")}>
                    Investigate
                  </button>
                  <button className="btn btn-ghost text-xs px-2 py-1 text-red" onClick={() => act(f.id, "dismissed")}>
                    Dismiss
                  </button>
                </td>
              </tr>
            ))}
            {flags.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-textDim">
                  No open flags right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
