"use client";

import { usePathname } from "next/navigation";

/**
 * 26 Aug 2026, Steven: "I dont need to see buyer wants, list an item,
 * Portfolio, Wishlist and all that [in the admin dashboard], need to be
 * able to manage resellers from this panel." The admin section
 * (app/admin/layout.tsx) already has its own purpose-built nav — this
 * customer-facing tab row was still rendering above it on every /admin/*
 * page since it lives in the root layout. Hidden here instead of doing the
 * hiding in admin/layout.tsx, because usePathname (client-only) is the only
 * reliable way to know the current route from inside a nav that the root
 * layout — an async Server Component — renders on every page.
 */
export default function SiteNav({
  isAuthed,
  canFulfill,
  canSniper,
}: {
  isAuthed: boolean;
  canFulfill: boolean;
  canSniper: boolean;
}) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <nav className="flex justify-center gap-1 text-sm px-6 border-t border-border overflow-x-auto">
      {isAuthed && <a href="/dashboard" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Dashboard</a>}
      <a href="/opportunities" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Live Opportunities</a>
      {/* 27 Aug 2026, Steven: "list an item should not be a thing for
          someone who hasnt signed in yet, also goes for buyer wants" —
          both now match every other account-only tab here (Dashboard,
          Flipsta It!, Portfolio, Wishlist, Wallet): hidden from the nav
          entirely when signed out, and the pages themselves now show a
          sign-in prompt instead of their real content if someone reaches
          them by a direct link anyway (see wants/page.tsx, sell/new/page.tsx). */}
      {isAuthed && <a href="/wants" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Buyer Wants</a>}
      <a href="/shop" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Shop</a>
      {/* 16 Sept 2026, Steven: coin shop page for Flippy Coins (see
          app/coins/page.tsx and planning/coin-economy-proposal.md) — no
          auth gate, same as Shop/Partner Deals, since anyone should be able
          to see coin pricing before signing up. UI-only for now: there's no
          coin ledger or Stripe product behind it yet. */}
      <a href="/coins" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Flippy Coins</a>
      {/* 27 Aug 2026, Steven: "i need assistance setting up Awin api to
          fill my store with goods... this is seperate from our core
          buisness." No auth gate — same as Shop, purely a browse-and-
          click-through page, nothing account-specific here. */}
      <a href="/partner-deals" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Partner Deals</a>
      {/* 27 Aug 2026, Steven: "i would like to be able to offer my resellers
          the oppotunity to do live selling via my site. a bit like QVC."
          No auth gate — same as Shop, anyone can watch a live show, sign-in
          is only required to actually bid/chat/buy (enforced server-side,
          see api/live-shows/[id]/items/[itemId]/bid). */}
      <a href="/live" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Live</a>
      {/* 27 Aug 2026, Steven: "have a leaderboard showing who is the top
          seller by profit on the site." Confirmed "Fully public" — no auth
          gate, visible to a pre-signup visitor too (Section 12.1-style
          social proof to help sell the reseller opportunity). */}
      <a href="/leaderboard" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Leaderboard</a>
      {/* 26 Aug 2026, Steven: "Need a button that says Flipsta It!" */}
      {isAuthed && <a href="/flipsta-it" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Flipsta It!</a>}
      {/* 27 Aug 2026, Steven: "Sniper mode needs setting up with its own
          tab." Gated the same way Fulfillment jobs is — Pro/Elite only
          (TIER_ENTITLEMENTS[tier].sniperMode). */}
      {isAuthed && canSniper && (
        <a href="/sniper" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Sniper Mode</a>
      )}
      {isAuthed && <a href="/sell/new" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">List an item</a>}
      {/* 28 Aug 2026, Steven: "need an option in the sellers dashboard to
          add own stock they have for sale." */}
      {isAuthed && <a href="/sell/stock" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">My Stock</a>}
      {isAuthed && <a href="/portfolio" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Portfolio</a>}
      {isAuthed && <a href="/wishlist" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Wishlist</a>}
      {isAuthed && canFulfill && (
        <a href="/fulfillment" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Fulfillment jobs</a>
      )}
      {isAuthed && <a href="/wallet" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Wallet</a>}
      {isAuthed && <a href="/referrals" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Referrals</a>}
      {isAuthed && <a href="/account" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Account</a>}
      {isAuthed && <a href="/settings/connections" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Connected accounts</a>}
    </nav>
  );
}
