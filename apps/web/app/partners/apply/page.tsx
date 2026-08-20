"use client";

import { useState } from "react";

/**
 * Section 12.2 — public self-serve partner application. Previously the
 * only way to add a supplier or courier affiliate was an admin manually
 * filling in /admin/partners; this is the "easy way to sign up" — a
 * distributor or courier applies here, it lands as `pending` in the same
 * admin Partners queue for approval.
 */
export default function PartnerApplyPage() {
  const [name, setName] = useState("");
  const [type, setType] = useState("supplier");
  const [email, setEmail] = useState("");
  const [commission, setCommission] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const res = await fetch("/api/partners/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, contactEmail: email, commissionOrCode: commission, notes }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Something went wrong.");
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-bold">Application received</h1>
        <p className="text-textDim text-sm">
          Thanks — a member of the Flipsta team will review your application and follow up by email.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Become a Flipsta partner</h1>
      <p className="text-textDim text-sm">
        For clearance/wholesale suppliers (Section 11.5) and courier affiliate programmes (Section 12.2). Submit
        below — it lands with our team as a pending application, no account needed.
      </p>
      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Business name</label>
        <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Type</label>
        <select className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="supplier">Supplier / wholesale clearance</option>
          <option value="courier">Courier affiliate</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Contact email</label>
        <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Proposed commission / affiliate code (optional)</label>
        <input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" value={commission} onChange={(e) => setCommission(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-bold text-textDim uppercase tracking-wide mb-1">Anything else? (optional)</label>
        <textarea className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="text-red text-sm">{error}</p>}
      <button className="btn btn-primary" onClick={submit} disabled={!name || !email}>
        Submit application
      </button>
    </div>
  );
}
