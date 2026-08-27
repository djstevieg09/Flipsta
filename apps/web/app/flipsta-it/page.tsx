"use client";

import { useEffect, useState } from "react";

type PhotoCandidate = { imageUrl: string; sourceUrl: string; label: string };

type BuyRequest = {
  id: string;
  description: string;
  target_price_gbp: number;
  photo_url: string | null;
  status: string;
  admin_note: string | null;
  found_product_name: string | null;
  found_source_retailer: string | null;
  found_source_url: string | null;
  found_price_gbp: number | null;
  found_image_url: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  pending_approval: { text: "Waiting for approval", className: "text-textDim" },
  approved: { text: "Approved — search queued", className: "text-brand2" },
  searching: { text: "Searching now…", className: "text-brand2" },
  found: { text: "Found it!", className: "text-green font-bold" },
  not_found: { text: "Nothing found yet", className: "text-textDim" },
  rejected: { text: "Not approved", className: "text-red" },
  cancelled: { text: "Cancelled", className: "text-textFaint" },
};

/**
 * 26 Aug 2026, Steven: "Need a button that says Flipsta It! that when
 * pressed it then take the user to another page which will ask for as much
 * info as possible. like description and then ask for a photo, give the
 * user some google images to choose from. once clicked on photo and
 * description this then goes to admin panel to approve. Then admin click a
 * button AI then goes out and finds the deal that is under what the user is
 * looking to pay."
 *
 * Notifying the shopper by text once found is a deliberately later round
 * (Steven: "eventually... but for now just add the button and the UI") —
 * this page's own request list is how someone checks on a request for now.
 */
export default function FlipstaItPage() {
  const [description, setDescription] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [candidates, setCandidates] = useState<PhotoCandidate[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoCandidate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<BuyRequest[]>([]);
  const [signedOut, setSignedOut] = useState(false);

  function loadRequests() {
    fetch("/api/buy-requests").then(async (r) => {
      if (r.status === 401) {
        setSignedOut(true);
        return;
      }
      const d = await r.json();
      setRequests(d.requests ?? []);
    });
  }

  useEffect(loadRequests, []);

  async function findPhotos() {
    if (!description.trim()) {
      setError("Describe the item first.");
      return;
    }
    setError(null);
    setLoadingPhotos(true);
    setCandidates([]);
    setSelectedPhoto(null);
    try {
      const res = await fetch("/api/buy-requests/find-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const d = await res.json();
      setCandidates(d.candidates ?? []);
      if (!d.candidates || d.candidates.length === 0) {
        setError("Couldn't find any photos automatically — no problem, you can still submit the request without one.");
      }
    } finally {
      setLoadingPhotos(false);
    }
  }

  async function submit() {
    setError(null);
    const price = Number(targetPrice);
    if (!description.trim()) {
      setError("Describe the item you're after.");
      return;
    }
    if (!price || price <= 0) {
      setError("Enter a target price above £0.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/buy-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          targetPriceGBP: price,
          photoUrl: selectedPhoto?.imageUrl ?? null,
          photoSourceUrl: selectedPhoto?.sourceUrl ?? null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to submit request.");
        return;
      }
      setDescription("");
      setTargetPrice("");
      setCandidates([]);
      setSelectedPhoto(null);
      loadRequests();
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    await fetch(`/api/buy-requests/${id}`, { method: "DELETE" });
    loadRequests();
  }

  if (signedOut) {
    return (
      <div className="card max-w-md mx-auto text-center space-y-3 py-8">
        <h1 className="text-xl font-extrabold">Flipsta It!</h1>
        <p className="text-textDim text-sm">Sign in to ask Flipsta's AI to go find a specific item for you.</p>
        <a href="/login" className="btn btn-primary">Sign in</a>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-extrabold">Flipsta It! 🔎</h1>
        <p className="text-textDim text-sm">
          Tell us exactly what you're after and the most you'd pay — once approved, our AI goes and searches for it.
        </p>
      </div>

      <div className="card space-y-4">
        {error && <p className="text-red text-sm">{error}</p>}
        <div>
          <label className="text-xs text-textDim mb-1 block">What are you after?</label>
          <textarea
            className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
            rows={3}
            placeholder="Be as specific as you can — brand, model, colour, size…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-textDim mb-1 block">Most you'd pay (£)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="e.g. 50"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
          />
        </div>

        <div>
          <button className="btn btn-ghost text-xs" onClick={findPhotos} disabled={loadingPhotos || !description.trim()}>
            {loadingPhotos ? "Searching for photos…" : "Find photos of this"}
          </button>
        </div>

        {candidates.length > 0 && (
          <div>
            <div className="text-xs text-textDim mb-2">Pick the one that matches (optional):</div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {candidates.map((c) => (
                <button
                  key={c.imageUrl}
                  type="button"
                  onClick={() => setSelectedPhoto(selectedPhoto?.imageUrl === c.imageUrl ? null : c)}
                  className={`rounded-lg border-2 overflow-hidden ${selectedPhoto?.imageUrl === c.imageUrl ? "border-brand2" : "border-border"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageUrl} alt={c.label} className="w-full h-20 object-contain bg-surface2" />
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-primary w-full" onClick={submit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit request"}
        </button>
        <p className="text-textFaint text-xs">
          Every request is reviewed before the AI searches for it — you'll see the status below once it's approved.
        </p>
      </div>

      {requests.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold text-lg">Your requests</h2>
          {requests.map((r) => {
            const s = STATUS_LABEL[r.status] ?? { text: r.status, className: "text-textDim" };
            return (
              <div key={r.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-sm">{r.description}</div>
                    <div className="text-xs text-textDim">Target: £{Number(r.target_price_gbp).toFixed(2)}</div>
                  </div>
                  <span className={`text-xs whitespace-nowrap ${s.className}`}>{s.text}</span>
                </div>
                {r.status === "found" && (
                  <div className="rounded-lg bg-green/10 border border-green/30 p-3 text-sm space-y-1">
                    <div className="font-bold">{r.found_product_name}</div>
                    <div className="text-textDim">
                      £{Number(r.found_price_gbp).toFixed(2)} at {r.found_source_retailer}
                    </div>
                    {r.found_source_url && (
                      <a href={r.found_source_url} target="_blank" rel="noreferrer" className="text-brand2 text-xs hover:underline">
                        View listing ↗
                      </a>
                    )}
                  </div>
                )}
                {(r.status === "pending_approval" || r.status === "approved") && (
                  <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => cancel(r.id)}>
                    Cancel request
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
