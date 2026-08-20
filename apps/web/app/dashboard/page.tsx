import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/currentProfile";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";

/**
 * Section 7/12.1 — a real, tier-aware home base. Not a pixel port of the
 * three separate Standard/Pro/Elite mockup dashboards (see STATUS.md) —
 * one unified page whose feature list is driven by the same
 * TIER_ENTITLEMENTS map every API route already enforces, so what's shown
 * here always matches what the account can actually do.
 */
export default async function DashboardPage() {
  const auth = await getCurrentProfile();
  if (!auth) redirect("/login");

  const entitlements = TIER_ENTITLEMENTS[auth.profile.subscriptionTier];

  const features: { label: string; on: boolean; note?: string }[] = [
    { label: "Bid on opportunities", on: entitlements.canBid },
    { label: "Sell on the marketplace", on: entitlements.canSell },
    { label: "Sniper mode (auto-bid)", on: entitlements.sniperMode, note: "Pro & Elite" },
    { label: "Early access window", on: entitlements.earlyAccessSeconds > 0, note: "Pro & Elite" },
    { label: "AI reasoning on opportunities", on: entitlements.aiExplainability, note: "Pro & Elite" },
    { label: "Multi-platform listing (eBay/Amazon/Vinted/Facebook/Depop)", on: entitlements.multiPlatformListing, note: "Pro & Elite" },
    { label: "Syndicate leadership", on: entitlements.syndicateLeadership, note: "Elite only" },
  ];

  const links = [
    { href: "/opportunities", label: "Live Opportunities" },
    { href: "/wants", label: "Buyer Wants" },
    { href: "/shop", label: "Marketplace" },
    { href: "/sell/new", label: "List an item" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/wallet", label: "Wallet" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {auth.profile.displayName}</h1>
        <p className="text-textDim text-sm capitalize">{auth.profile.subscriptionTier} plan</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {links.map((l) => (
          <a key={l.href} href={l.href} className="card hover:border-brand transition font-bold text-sm">
            {l.label} →
          </a>
        ))}
      </div>

      <div className="card">
        <h2 className="font-bold mb-3">Your plan includes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {features.map((f) => (
            <div key={f.label} className="flex items-center justify-between text-sm border-b border-border py-2 last:border-0">
              <span className={f.on ? "" : "text-textFaint"}>{f.label}</span>
              {f.on ? (
                <span className="text-green text-xs font-bold">Included</span>
              ) : (
                <span className="text-xs text-gold">{f.note ?? "Upgrade"}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
