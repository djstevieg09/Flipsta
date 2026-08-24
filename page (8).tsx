"use client";

import { useEffect, useState } from "react";

/**
 * Section 7 — self-serve subscription tier upgrades. Previously the only
 * way to change a seller's tier was an admin editing it directly in
 * /admin/sellers (see STATUS.md); this is the real, user-facing version of
 * that, backed by Stripe Checkout (apps/web/app/api/billing/checkout) and
 * the Stripe portal for managing/cancelling (apps/web/app/api/billing/portal).
 *
 * Prices shown here are the business doc's Section 7 figures for display
 * only — the amount actually charged comes from whatever Price is attached
 * to each tier's Stripe Price ID (see INFRASTRUCTURE_TODO.md), since the
 * final number is a business decision made in Stripe, not hardcoded here.
 */
const TIERS: { id: "standard" | "pro" | "elite"; name: string; price: string; blurb: string }[] = [
  { id: "standard", name: "Standard", price: "~£15/mo", blurb: "Full bidding on the live feed, 12% marketplace commission." },
  { id: "pro", name: "Pro", price: "~£35–45/mo", blurb: "Early access window, sniper mode, AI explainability, multi-platform listing, 8% commission." },
  { id: "elite", name: "Elite", price: "~£85–120/mo", blurb: "Everything in Pro, plus syndicate leadership and 5% commission." },
];

export default function UpgradePage() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") setNotice("Subscription updated — this can take a few seconds to reflect above.");
    if (params.get("checkout") === "cancelled") setNotice("Checkout cancelled — no changes were made.");
  }, []);

  async function upgrade(tier: string) {
    setError(null);
    setLoadingTier(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong starting checkout.");
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
      setLoadingTier(null);
    }
  }

  async function manageBilling() {
    setError(null);
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong opening the billing portal.");
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
      setPortalLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upgrade your plan</h1>
        <p className="text-textDim text-sm">Payment and subscription management are handled securely by Stripe.</p>
      </div>

      {notice && <p className="text-sm text-green">{notice}</p>}
      {error && <p className="text-sm text-red">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TIERS.map((t) => (
          <div key={t.id} className="card space-y-3">
            <div>
              <h2 className="font-bold">{t.name}</h2>
              <p className="text-sm text-textDim">{t.price}</p>
            </div>
            <p className="text-xs text-textDim">{t.blurb}</p>
            <button className="btn btn-primary w-full" disabled={loadingTier !== null} onClick={() => upgrade(t.id)}>
              {loadingTier === t.id ? "Redirecting…" : `Upgrade to ${t.name}`}
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="font-bold mb-1">Already subscribed?</h2>
        <p className="text-xs text-textDim mb-3">Change tier, update your card, or cancel — all handled by Stripe's billing portal.</p>
        <button className="btn" disabled={portalLoading} onClick={manageBilling}>
          {portalLoading ? "Opening…" : "Manage billing"}
        </button>
      </div>
    </div>
  );
}
