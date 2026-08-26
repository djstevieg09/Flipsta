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
}: {
  isAuthed: boolean;
  canFulfill: boolean;
}) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <nav className="flex justify-center gap-1 text-sm px-6 border-t border-border overflow-x-auto">
      {isAuthed && <a href="/dashboard" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Dashboard</a>}
      <a href="/opportunities" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Live Opportunities</a>
      <a href="/wants" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Buyer Wants</a>
      <a href="/shop" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Shop</a>
      <a href="/sell/new" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">List an item</a>
      {isAuthed && <a href="/portfolio" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Portfolio</a>}
      {isAuthed && <a href="/wishlist" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Wishlist</a>}
      {isAuthed && canFulfill && (
        <a href="/fulfillment" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Fulfillment jobs</a>
      )}
      {isAuthed && <a href="/wallet" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Wallet</a>}
      {isAuthed && <a href="/referrals" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Referrals</a>}
      {isAuthed && <a href="/settings/connections" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Connected accounts</a>}
    </nav>
  );
}
