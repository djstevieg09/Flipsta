"use client";

import { useEffect, useState } from "react";

type Partner = {
  id: string;
  name: string;
  type: "supplier" | "courier";
  status: string;
  commissionOrCode: string | null;
  createdAt: string;
};

export default function AdminPartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("supplier");
  const [commission, setCommission] = useState("");

  function load() {
    fetch("/api/admin/partners")
      .then((r) => r.json())
      .then((d) =>
        setPartners(
          (d.partners ?? []).map((p: any) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            status: p.status,
            commissionOrCode: p.commission_or_code,
            createdAt: p.created_at,
          })),
        ),
      );
  }

  useEffect(load, []);

  async function addPartner() {
    if (!name) return;
    await fetch("/api/admin/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, commissionOrCode: commission }),
    });
    setName("");
    setCommission("");
    setShowForm(false);
    load();
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/admin/partners/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">
        Section 12.2 — supplier partners (commission charged) and courier affiliates (affiliate code tracked), in one
        table.
      </p>
      <button className="btn btn-primary text-xs" onClick={() => setShowForm((v) => !v)}>
        + Add partner
      </button>

      {showForm && (
        <div className="card max-w-md space-y-3">
          <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" placeholder="Partner name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="supplier">Supplier</option>
            <option value="courier">Courier</option>
          </select>
          <input
            className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="Commission rate or affiliate code"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
          />
          <button className="btn btn-primary text-xs" onClick={addPartner}>
            Add as pending
          </button>
        </div>
      )}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-textDim text-xs uppercase border-b border-border">
              <th className="p-3">Partner</th>
              <th className="p-3">Type</th>
              <th className="p-3">Commission / code</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="p-3 font-bold">{p.name}</td>
                <td className="p-3 capitalize">{p.type}</td>
                <td className="p-3">{p.commissionOrCode ?? "—"}</td>
                <td className="p-3 capitalize">{p.status}</td>
                <td className="p-3 space-x-2 whitespace-nowrap">
                  {p.status !== "active" && (
                    <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => setStatus(p.id, "active")}>
                      Approve
                    </button>
                  )}
                  {p.status !== "suspended" && (
                    <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => setStatus(p.id, "suspended")}>
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {partners.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-textDim">
                  No partners yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
