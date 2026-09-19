import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/currentProfile";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";
import BecomeResellerBanner from "@/app/components/BecomeResellerBanner";
import PageHero from "@/app/components/PageHero";

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

  // 19 Sept 2026 — early access is now a cascade (Platinum first, then
  // Gold +15min, then Silver +30min, then everyone at +45min — see
  // tierGuard.ts) rather than a flat Pro/Elite-only perk, so this reads
  // the actual delay for the account's own tier instead of a fixed note.
  const earlyAccessNote =
    entitlements.earlyAccessDelayMinutes === 0
      ? "You see every new opportunity first"
      : `${entitlements.earlyAccessDelayMinutes} min after Platinum`;

  const features: { label: string; on: boolean; note?: string }[] = [
    { label: "Bid on opportunities", on: entitlements.canBid, note: auth.profile.subscriptionTier === "free" ? "spend Flippy Coins" : undefined },
    { label: "Sell on the marketplace", on: entitlements.canSell },
    { label: "Sniper mode (auto-bid)", on: entitlements.sniperMode, note: "Pro & Elite" },
    { label: "Early access on new opportunities", on: entitlements.earlyAccessDelayMinutes < 45, note: earlyAccessNote },
    { label: "AI reasoning on opportunities", on: entitlements.aiExplainability, note: "Pro & Elite" },
    { label: "Multi-platform listing (eBay/Depop/Etsy/Whatnot/StockX)", on: entitlements.multiPlatformListing, note: "Pro & Elite" },
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
      <PageHero
        eyebrow={`${auth.profile.subscriptionTier} plan`}
        title={
          <>
            Welcome back, <span className="text-gold">{auth.profile.displayName}</span>
          </>
        }
        subtitle="Everything about your account in one place — your plan, quick links to every part of the site, and what's included."
        decorations={[
          { emoji: "📊", className: "-top-4 -left-6", animate: "bob" },
          { emoji: "📈", className: "top-1 -right-7", animate: "sway" },
          { emoji: "💰", className: "-bottom-3 left-1/3 w-11 h-11", boxed: true, animate: "bob", delay: "0.4s" },
        ]}
      />

      <div className="flex justify-end">
        <a href="/upgrade" className="btn btn-primary">
          {auth.profile.subscriptionTier === "elite" ? "Manage billing" : "Upgrade plan"}
        </a>
      </div>

      {(auth.profile.subscriptionTier === "free" || auth.profile.subscriptionTier === "standard") && (
        <BecomeResellerBanner />
      )}

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
