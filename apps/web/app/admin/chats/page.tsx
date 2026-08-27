"use client";

import { useEffect, useState } from "react";

type Conversation = {
  id: string;
  displayName: string;
  status: string;
  escalatedTicketId: string | null;
  messageCount: number;
  lastMessage: string;
  createdAt: string;
  updatedAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  active: "text-green",
  escalated: "text-gold",
  closed: "text-textDim",
};

/**
 * Section 12.1 — Steven, 27 Aug 2026: "need to set this up on the admin
 * dashboard aswell so we can track who we have spoken to etc." Every real
 * chatbot conversation, not just the ones that became a ticket — see
 * /api/admin/chats.
 */
export default function AdminChatsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/admin/chats")
      .then((r) => r.json())
      .then((d) => setConversations(d.conversations ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? conversations : conversations.filter((c) => c.status === filter);

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm">
        Every real conversation the support chat widget has had, newest first — real data from{" "}
        <code>/api/admin/chats</code>. An escalated conversation links through to the ticket it opened.
      </p>
      <div className="flex gap-1">
        {["all", "active", "escalated", "closed"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize ${filter === s ? "bg-brand text-bg" : "bg-surface2 text-textDim"}`}
          >
            {s}
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
                <th className="p-3">Status</th>
                <th className="p-3">Messages</th>
                <th className="p-3">Last message</th>
                <th className="p-3">Updated</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-bold">{c.displayName}</td>
                  <td className={`p-3 capitalize font-bold ${STATUS_COLOR[c.status] ?? ""}`}>{c.status}</td>
                  <td className="p-3">{c.messageCount}</td>
                  <td className="p-3 text-textDim max-w-xs truncate">{c.lastMessage}</td>
                  <td className="p-3 text-textDim">{new Date(c.updatedAt).toLocaleString()}</td>
                  <td className="p-3 whitespace-nowrap space-x-2">
                    <a href={`/admin/chats/${c.id}`} className="btn btn-ghost text-xs px-2 py-1">
                      View
                    </a>
                    {c.escalatedTicketId && (
                      <a href="/admin/tickets" className="text-xs text-gold underline">
                        Ticket →
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-textDim">
                    No conversations{filter !== "all" ? ` with status "${filter}"` : ""} yet.
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
