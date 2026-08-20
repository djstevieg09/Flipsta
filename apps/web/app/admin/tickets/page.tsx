"use client";

import { useEffect, useState } from "react";

type Ticket = {
  id: string;
  category: string;
  priority: string;
  status: string;
  subject: string;
  body: string;
  requesterName: string;
  slaDueAt: string;
  breachingSla: boolean;
};

const CATEGORIES = ["payment_dispute", "buyback_claim", "item_not_as_described", "courier_issue", "account"];
const STATUSES = ["open", "in_progress", "waiting_on_user", "resolved"];

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("open");

  function load() {
    setLoading(true);
    const qs = category ? `?category=${category}` : "";
    fetch(`/api/admin/tickets${qs}`)
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, [category]);

  const active = tickets.find((t) => t.id === openId) ?? null;

  function openTicket(t: Ticket) {
    setOpenId(t.id);
    setNote("");
    setStatus(t.status);
  }

  async function saveTicket() {
    if (!openId) return;
    await fetch(`/api/admin/tickets/${openId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note: note || undefined }),
    });
    setOpenId(null);
    load();
  }

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">
        The only buyer/seller contact channel for a dispute (Section 12.1) — this is what keeps the Section 5
        blind-teaser protection intact.
      </p>
      <div className="flex gap-2 flex-wrap">
        <button className={`btn ${category === "" ? "btn-primary" : "btn-ghost"} text-xs`} onClick={() => setCategory("")}>
          All
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} className={`btn ${category === c ? "btn-primary" : "btn-ghost"} text-xs`} onClick={() => setCategory(c)}>
            {c.replace(/_/g, " ")}
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
                <th className="p-3">Ticket</th>
                <th className="p-3">Category</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Requester</th>
                <th className="p-3">SLA</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <div className="font-bold">{t.subject}</div>
                  </td>
                  <td className="p-3">{t.category.replace(/_/g, " ")}</td>
                  <td className="p-3 capitalize">{t.priority}</td>
                  <td className="p-3">{t.requesterName}</td>
                  <td className={`p-3 ${t.breachingSla ? "text-red font-bold" : "text-textDim"}`}>
                    {t.breachingSla ? "Breaching" : new Date(t.slaDueAt).toLocaleString()}
                  </td>
                  <td className="p-3 capitalize">{t.status.replace(/_/g, " ")}</td>
                  <td className="p-3">
                    <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => openTicket(t)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-textDim">
                    No tickets in this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center p-10 overflow-y-auto z-50" onClick={() => setOpenId(null)}>
          <div className="card max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg mb-1">{active.subject}</h2>
            <p className="text-xs text-textDim mb-4">
              {active.category.replace(/_/g, " ")} · {active.requesterName}
            </p>
            <p className="text-sm bg-surface2 rounded-lg p-3 mb-4">{active.body}</p>
            <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Internal note</label>
            <textarea
              className="w-full bg-surface2 border border-border rounded-lg p-2 text-sm mb-4"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Not visible to the requester…"
            />
            <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Status</label>
            <select className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm mb-4" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost text-xs" onClick={() => setOpenId(null)}>
                Cancel
              </button>
              <button className="btn btn-primary text-xs" onClick={saveTicket}>
                Save &amp; update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
