"use client";

import { useEffect, useState } from "react";
import { MARKETPLACE_COMMISSION_RATE, BUYBACK_TIER_DISCOUNT, SubscriptionTier } from "@flipsta/shared";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";

/**
 * Section 7 — self-serve subscription tier upgrades. Previously the only
 * way to change a seller's tier was an admin editing it directly in
 * /admin/sellers (see STATUS.md); this is the real, user-facing version of
 * that, backed by Stripe Checkout (apps/web/app/api/billing/checkout) and
 * the Stripe portal for managing/cancelling (apps/web/app/api/billing/portal).
 *
 * 27 Aug 2026, Steven: "needs to have the upgrade options available to them
 * in a clear options with perks per tier" — the original version of this
 * page (one blurb sentence per paid tier) already existed and was already
 * linked from /dashboard's "Upgrade plan" button, but didn't lay out perks
 * clearly and left Free out of the comparison entirely. Rebuilt as a real
 * 4-column comparison (including Free, so upgrading actually feels like an
 * upgrade) with a real perk checklist per tier — commission % and buyback
 * discount pulled straight from packages/shared/src/constants.ts and
 * lib/tierGuard.ts's TIER_ENTITLEMENTS rather than retyped, so this can
 * never silently drift from what the rest of the app actually enforces.
 *
 * Prices shown here are the business doc's Section 7 figures for display
 * only — the amount actually charged comes from whatever Price is attached
 * to each tier's Stripe Price ID (see INFRASTRUCTURE_TODO.md), since the
 * final number is a business decision made in Stripe, not hardcoded here.
 */
const TIER_RANK: Record<SubscriptionTier, number> = { free: 0, standard: 1, pro: 2, elite: 3 };

const TIERS: {
  id: SubscriptionTier;
  name: string;
  price: string;
  tagline: string;
  perks: string[];
}[] = [
  {
    id: "free",
    name: "Free",
    price: "£0",
    tagline: "Browse and learn how the market's moving.",
    perks: [
      "Public Flip Index & AI accuracy score",
      "Redacted teasers — see every opportunity's category, margin band and confidence score",
      "Demo/practice mode with fake credits",
      "Buy/Hold/Avoid rating shown on teasers",
    ],
  },
  {
    id: "standard",
    name: "Standard",
    price: "~£15/mo",
    tagline: "Full access to bid, buy, and sell.",
    perks: [
      "Full bidding on the live opportunity feed",
      "One sector follow",
      `Basic portfolio dashboard — profit/loss, win rate, streak`,
      `Sell on the internal marketplace at ${Math.round(MARKETPLACE_COMMISSION_RATE.standard * 100)}% commission`,
      "Buyback insurance available on any purchase",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "~£35–45/mo",
    tagline: "For active resellers who want the edge.",
    perks: [
      "Everything in Standard, plus:",
      `Early access — a ${Math.round(TIER_ENTITLEMENTS.pro.earlyAccessSeconds / 60)}-minute head start on new opportunities`,
      "Unlimited sector follows",
      "AI \"why\" explainability on every opportunity",
      "Sniper mode — automatic bidding within your own rules",
      "One-click multi-platform listing (eBay/Depop/Etsy/Whatnot/StockX)",
      `Sell on the internal marketplace at ${Math.round(MARKETPLACE_COMMISSION_RATE.pro * 100)}% commission`,
      `${Math.round(BUYBACK_TIER_DISCOUNT.pro * 100)}% off buyback insurance`,
      "Eligible to fulfil Flipsta Sourced Deals orders and earn the reward",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    price: "~£85–120/mo",
    tagline: "Full syndicate power and priority everything.",
    perks: [
      "Everything in Pro, plus:",
      "Syndicate leadership — pool capital with other users on bigger opportunities",
      "Highest sniper budget limits, with priority processing",
      `Sell on the internal marketplace at ${Math.round(MARKETPLACE_COMMISSION_RATE.elite * 100)}% commission`,
      `${Math.round(BUYBACK_TIER_DISCOUNT.elite * 100)}% off buyback insurance, plus priority claims handling`,
      "Priority human support & dedicated account analytics",
    ],
  },
];

/**
 * 27 Aug 2026, Steven: "When i click upgraade to pro or any others i get
 * Unexpected token '<', "<!DOCTYPE " is not valid JSON." Both
 * /api/billing/checkout and /api/billing/portal always return real JSON on
 * every path (checked — even the "not configured yet" case is a proper 503
 * JSON body), so this can only happen if the browser never actually reached
 * that route handler at all — a stale/incomplete deploy 404ing straight to
 * Next's HTML error page is the most common real-world cause, and
 * `res.json()` throws exactly this cryptic native error on HTML input.
 * Parsing the body as text first and only then trying JSON.parse turns that
 * into an actual, readable message instead of a dead end.
 */
async function parseJsonResponse(res: Response): Promise<{ error?: string; url?: string }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `The server sent back something that wasn't valid JSON (status ${res.status}) — this usually means the latest web deploy is missing this page's API routes. Try again in a minute, or check the deploy on Render.`,
    );
  }
}

export default function UpgradePage() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentTier, setCurrentTier] = useState<SubscriptionTier | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") setNotice("Subscription updated — this can take a few seconds to reflect above.");
    if (params.get("checkout") === "cancelled") setNotice("Checkout cancelled — no changes were made.");
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setCurrentTier(d.profile?.subscriptionTier ?? null))
      .catch(() => {});
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
      const data = await parseJsonResponse(res);
      if (!res.ok || !data.url) throw new Error(data.error ?? "Something went wrong starting checkout.");
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
      const data = await parseJsonResponse(res);
      if (!res.ok || !data.url) throw new Error(data.error ?? "Something went wrong opening the billing portal.");
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
      setPortalLoading(false);
    }
  }

  const currentRank = currentTier ? TIER_RANK[currentTier] : -1;

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        {/* 19 Sept 2026, Steven: "we also need the pricing on the first
            landing page, its own tab so people can see what it costs" — now
            linked from the main nav as "Pricing" (SiteNav.tsx), reachable
            signed-out, so the heading needs to read as a plain pricing page
            first and an upgrade page second (it's still exactly that for a
            signed-in user — same content, same buttons). */}
        <h1 className="text-2xl font-bold">Plans &amp; Pricing</h1>
        <p className="text-textDim text-sm">Payment and subscription management are handled securely by Stripe.</p>
      </div>

      {notice && <p className="text-sm text-green">{notice}</p>}
      {error && <p className="text-sm text-red">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-stretch">
        {TIERS.map((t) => {
          const rank = TIER_RANK[t.id];
          const isCurrent = currentTier !== null && rank === currentRank;
          const isDowngrade = currentTier !== null && rank < currentRank;
          const isFree = t.id === "free";
          return (
            <div
              key={t.id}
              className={`card space-y-3 flex flex-col ${isCurrent ? "border-brand2 border-2" : ""}`}
            >
              <div>
                {isCurrent && (
                  <span className="text-[10px] font-bold uppercase text-brand2">Your current plan</span>
                )}
                <h2 className="font-bold">{t.name}</h2>
                <p className="text-sm text-textDim">{t.price}</p>
                <p className="text-xs text-textDim mt-1">{t.tagline}</p>
              </div>
              <ul className="text-xs space-y-1.5 flex-1">
                {t.perks.map((perk) => (
                  <li key={perk} className={perk.endsWith(":") ? "font-bold text-textDim pt-1" : "flex gap-1.5"}>
                    {!perk.endsWith(":") && <span className="text-green">✓</span>}
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              {isFree ? (
                <button className="btn w-full" disabled>
                  {isCurrent ? "Your current plan" : "Free forever"}
                </button>
              ) : isCurrent ? (
                <button className="btn w-full" disabled>
                  Your current plan
                </button>
              ) : isDowngrade ? (
                <button className="btn w-full" disabled={portalLoading} onClick={manageBilling}>
                  {portalLoading ? "Opening…" : "Manage billing to switch"}
                </button>
              ) : (
                <button className="btn btn-primary w-full" disabled={loadingTier !== null} onClick={() => upgrade(t.id)}>
                  {loadingTier === t.id ? "Redirecting…" : `Upgrade to ${t.name}`}
                </button>
              )}
            </div>
          );
        })}
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
