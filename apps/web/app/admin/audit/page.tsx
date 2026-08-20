"use client";

import { useEffect, useState } from "react";

type AuditEntry = {
  id: string;
  adminName: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
};

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch("/api/admin/audit-log").then(async (r) => {
      if (r.status === 403) {
        setForbidden(true);
        return;
      }
      const d = await r.json();
      setEntries(d.entries ?? []);
    });
  }, []);

  if (forbidden) {
    return <p className="text-textDim text-sm">The audit log is restricted to senior admins.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">Every admin action, logged with who, when, and why (Section 12.1).</p>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-textDim text-xs uppercase border-b border-border">
              <th className="p-3">Time</th>
              <th className="p-3">Admin</th>
              <th className="p-3">Action</th>
              <th className="p-3">Target</th>
              <th className="p-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="p-3 text-textDim">{new Date(e.createdAt).toLocaleString()}</td>
                <td className="p-3 font-bold">{e.adminName}</td>
                <td className="p-3">{e.action}</td>
                <td className="p-3 text-textDim">
                  {e.targetType} · {e.targetId.slice(0, 8)}
                </td>
                <td className="p-3 text-textDim">{e.reason ?? "—"}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-textDim">
                  No admin actions logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
