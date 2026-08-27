"use client";

import { useEffect, useState } from "react";

type BuyRequest = {
  id: string;
  description: string;
  target_price_gbp: number;
  photo_url: string | null;
  status: string;
  requester_display_name: string;
  found_product_name: string | null;
  found_source_retailer: string | null;
  found_source_url: string | null;
  found_price_gbp: number | null;
  found_image_url: string | null;
  created_at: string;
};

/**
 * 26 Aug 2026, Steven's "Flipsta It!" feature: "this then goes to admin
 * panel to approve. Then admin click a button AI then goes out and finds
 * the deal." Approve/reject a pending request, then Search once it's
 * approved — each search is a real AI spend, hence the approval gate.
 */
export default function AdminBuyRequestsPage() {
  const [requests, setRequests] = useState<BuyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/buy-requests")
      .then((r) => r.json())
      .then((d) => {
        setRequests(d.requests ?? []);
        setLoading(false);
      });
  }

  useEffect(load, []);

  async function setStatus(id: string, status: "approved" | "rejected") {
    setBusyId(id);
    await fetch(`/api/admin/buy-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    load();
  }

  async function runSearch(id: string) {
    setBusyId(id);
    await fetch(`/api/admin/buy-requests/${id}/search`, { method: "POST" });
    setBusyId(null);
    load();
  }

  const pending = requests.filter((r) => r.status === "pending_approval");
  const active = requests.filter((r) => ["approved", "searching"].includes(r.status));
  const resolved = requests.filter((r) => ["found", "not_found", "rejected", "cancelled"].includes(r.status));

  function Card({ r }: { r: BuyRequest }) {
    return (
      <div className="card space-y-2">
        <div className="flex items-start gap-3">
          {r.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.photo_url} alt="" className="w-16 h-16 object-contain bg-surface2 rounded-lg border border-border shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">{r.description}</div>
            <div className="text-xs text-textDim">
              {r.requester_display_name} · target £{Number(r.target_price_gbp).toFixed(2)}
            </div>
          </div>
        </div>

        {r.status === "found" && (
          <div className="rounded-lg bg-green/10 border border-green/30 p-2 text-xs space-y-0.5">
            <div className="font-bold">{r.found_product_name}</div>
            <div>£{Number(r.found_price_gbp).toFixed(2)} at {r.found_source_retailer}</div>
            {r.found_source_url && (
              <a href={r.found_source_url} target="_blank" rel="noreferrer" className="text-brand2 hover:underline">
                View listing ↗
              </a>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {r.status === "pending_approval" && (
            <>
              <button className="btn btn-primary text-xs px-2 py-1" disabled={busyId === r.id} onClick={() => setStatus(r.id, "approved")}>
                Approve
              </button>
              <button className="btn btn-ghost text-xs px-2 py-1" disabled={busyId === r.id} onClick={() => setStatus(r.id, "rejected")}>
                Reject
              </button>
            </>
          )}
          {r.status === "approved" && (
            <button className="btn btn-primary text-xs px-2 py-1" disabled={busyId === r.id} onClick={() => runSearch(r.id)}>
              {busyId === r.id ? "Searching…" : "Search now"}
            </button>
          )}
          {r.status === "searching" && <span className="text-xs text-textDim">Searching…</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-textDim text-sm max-w-2xl">
        Shopper requests from <code>/flipsta-it</code>. Approving one doesn't search it yet — that's a separate step
        (Search now), so nothing spends real AI budget until you've actually reviewed the request.
      </p>

      {loading && <p className="text-textDim text-sm">Loading…</p>}

      <div>
        <h2 className="font-bold text-sm text-textDim mb-2">Needs approval ({pending.length})</h2>
        {pending.length === 0 && !loading && <p className="text-textFaint text-sm">Nothing waiting.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pending.map((r) => <Card key={r.id} r={r} />)}
        </div>
      </div>

      <div>
        <h2 className="font-bold text-sm text-textDim mb-2">Approved / searching ({active.length})</h2>
        {active.length === 0 && !loading && <p className="text-textFaint text-sm">Nothing here.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {active.map((r) => <Card key={r.id} r={r} />)}
        </div>
      </div>

      <div>
        <h2 className="font-bold text-sm text-textDim mb-2">Resolved ({resolved.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {resolved.map((r) => <Card key={r.id} r={r} />)}
        </div>
      </div>
    </div>
  );
}
