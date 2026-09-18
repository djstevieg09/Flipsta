"use client";

import { useEffect, useState } from "react";

type Broadcast = {
  id: string;
  subject: string;
  body: string;
  status: "pending" | "sending" | "sent" | "failed";
  audience: "opted_in" | "all";
  recipientCount: number;
  createdAt: string;
  sentAt: string | null;
};

/**
 * 18 Sept 2026, Steven: "i need to setup resend so it can send emails for
 * sign ups and promo stuff." This is the "promo stuff" admin page — compose
 * a subject/body, pick an audience, hit send. It queues a 'pending' row
 * (migration 0037's promo_broadcasts) that apps/worker/src/jobs/
 * sendPromoBroadcasts.ts picks up on its next tick (every 5 minutes) and
 * actually sends through Resend, so "Sent" below can take a few minutes to
 * flip from "Pending" — that's expected, not a bug.
 */
export default function AdminBroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"opted_in" | "all">("opted_in");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function load() {
    fetch("/api/admin/broadcasts")
      .then((r) => r.json())
      .then((d) => {
        setBroadcasts(d.broadcasts ?? []);
        setLoading(false);
      });
  }

  useEffect(load, []);

  async function sendBroadcast() {
    setError(null);
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are both required.");
      return;
    }
    setSending(true);
    const res = await fetch("/api/admin/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, audience }),
    });
    setSending(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to queue broadcast.");
      return;
    }
    setSubject("");
    setBody("");
    setAudience("opted_in");
    setShowForm(false);
    load();
  }

  async function cancelBroadcast(id: string) {
    const res = await fetch(`/api/admin/broadcasts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Couldn't cancel that broadcast.");
      return;
    }
    load();
  }

  const statusStyle: Record<Broadcast["status"], string> = {
    pending: "text-brand2",
    sending: "text-brand2",
    sent: "text-green font-bold",
    failed: "text-red",
  };

  return (
    <div className="space-y-4">
      <p className="text-textDim text-sm max-w-2xl">
        Send a one-off promotional or marketing email through Resend. &quot;Opted-in only&quot; (the default) skips
        anyone who&apos;s turned marketing emails off from their Account page — same opt-out-any-time approach as
        deal-match notifications. Sending happens in the background, so a new broadcast sits as &quot;Pending&quot;
        for up to a few minutes before it actually goes out.
      </p>

      <button className="btn btn-primary text-xs" onClick={() => setShowForm((v) => !v)}>
        + New broadcast
      </button>

      {showForm && (
        <div className="card max-w-lg space-y-3">
          {error && <p className="text-red text-xs">{error}</p>}
          <input
            className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea
            className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="Email body (plain text)"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div>
            <div className="text-xs text-textDim mb-1">Audience</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAudience("opted_in")}
                className={`btn ${audience === "opted_in" ? "btn-primary" : "btn-ghost"} text-xs`}
              >
                Opted-in only
              </button>
              <button
                type="button"
                onClick={() => setAudience("all")}
                className={`btn ${audience === "all" ? "btn-primary" : "btn-ghost"} text-xs`}
              >
                Everyone (override)
              </button>
            </div>
          </div>
          <button className="btn btn-primary text-xs" onClick={sendBroadcast} disabled={sending}>
            {sending ? "Queuing…" : "Send broadcast"}
          </button>
        </div>
      )}

      {loading && <p className="text-textDim text-sm">Loading…</p>}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-textDim text-xs uppercase border-b border-border">
              <th className="p-3">Subject</th>
              <th className="p-3">Audience</th>
              <th className="p-3">Status</th>
              <th className="p-3">Recipients</th>
              <th className="p-3">Queued</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((b) => (
              <tr key={b.id} className="border-b border-border last:border-0 align-top">
                <td className="p-3 font-bold max-w-xs">{b.subject}</td>
                <td className="p-3 text-textDim whitespace-nowrap">{b.audience === "all" ? "Everyone" : "Opted-in"}</td>
                <td className={`p-3 whitespace-nowrap capitalize ${statusStyle[b.status]}`}>{b.status}</td>
                <td className="p-3 text-textDim whitespace-nowrap">{b.status === "sent" ? b.recipientCount : "—"}</td>
                <td className="p-3 text-textDim whitespace-nowrap">{new Date(b.createdAt).toLocaleString()}</td>
                <td className="p-3">
                  {b.status === "pending" && (
                    <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => cancelBroadcast(b.id)}>
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {broadcasts.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-textDim">
                  No broadcasts sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
