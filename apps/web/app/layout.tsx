import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { getCurrentProfile } from "@/lib/currentProfile";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";
import { BasketProvider } from "./BasketProvider";
import BasketIndicator from "./components/BasketIndicator";
import HeaderSearch from "./components/HeaderSearch";

export const metadata: Metadata = {
  title: "Flipsta",
  description: "AI-driven buy/sell exchange",
};

// Section 12.3 — the global header convention: logo left, a centered search
// bar, then a tab row underneath for section navigation. Applied here once
// so every page inherits it, matching what's already locked in across the
// four HTML mockups.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const auth = await getCurrentProfile();
  return (
    <html lang="en">
      <body>
        {/* BasketProvider wraps the whole app (not just /shop and /basket) so
            the header's count indicator stays accurate on every page — a
            client component here can still take server-rendered children,
            so wrapping RootLayout's body doesn't force the rest of the tree
            to become client components too. */}
        <BasketProvider>
          <header className="sticky top-0 z-50 flex flex-col border-b border-border bg-bg/90 backdrop-blur">
            <div className="flex items-center gap-5 h-15 px-6 py-3">
              <a href="/" className="flex items-center gap-2 font-extrabold text-lg whitespace-nowrap">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-black"
                      style={{ background: "linear-gradient(135deg,#5b7cfa,#22d3ee)" }}>F</span>
                Flipsta
              </a>
              <div className="flex-1 flex justify-center">
                {/* useSearchParams (inside HeaderSearch) requires a Suspense
                    boundary or Next's build fails static analysis. */}
                <Suspense fallback={<div className="w-full max-w-md h-9 rounded-full bg-surface2 border border-border" />}>
                  <HeaderSearch />
                </Suspense>
              </div>
              <BasketIndicator />
              {auth ? (
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <span className="text-xs text-textDim">
                    {auth.profile.displayName} · <span className="capitalize">{auth.profile.subscriptionTier}</span>
                  </span>
                  {(auth.profile.role === "admin" || auth.profile.role === "support") && (
                    <a href="/admin" className="text-xs font-bold text-textDim border border-border rounded-full px-3 py-1.5 hover:text-text hover:border-brand transition">
                      Staff
                    </a>
                  )}
                  <form action="/api/auth/signout" method="post">
                    <button className="text-xs font-bold text-textDim hover:text-text transition">Sign out</button>
                  </form>
                </div>
              ) : (
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <a href="/login" className="text-xs font-bold text-textDim hover:text-text transition px-2">Sign in</a>
                  <a href="/signup" className="text-xs font-bold border border-border rounded-full px-3 py-1.5 hover:text-text hover:border-brand transition">Sign up</a>
                </div>
              )}
            </div>
            <nav className="flex justify-center gap-1 text-sm px-6 border-t border-border overflow-x-auto">
              {auth && <a href="/dashboard" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Dashboard</a>}
              <a href="/opportunities" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Live Opportunities</a>
              <a href="/wants" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Buyer Wants</a>
              <a href="/shop" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Shop</a>
              <a href="/sell/new" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">List an item</a>
              {auth && <a href="/portfolio" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Portfolio</a>}
              {/* 26 Aug 2026, Steven: "wishlist / save for later" — kept
                  separate from Portfolio ("what I've done") since this is
                  "what I might do", same reasoning as Fulfillment jobs
                  getting its own tab rather than living under Portfolio. */}
              {auth && <a href="/wishlist" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Wishlist</a>}
              {/* 26 Aug 2026, Steven: "the order is then passed onto the pro
                  and elite opptunites as a free button to press to fulfill
                  the order" — only shown to tiers actually entitled to
                  claim a job (see tierGuard.ts's canFulfill). */}
              {auth && TIER_ENTITLEMENTS[auth.profile.subscriptionTier].canFulfill && (
                <a href="/fulfillment" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Fulfillment jobs</a>
              )}
              {auth && <a href="/wallet" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Wallet</a>}
              {auth && <a href="/settings/connections" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Connected accounts</a>}
            </nav>
          </header>
          <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
          <footer className="border-t border-border px-6 py-6 text-center text-xs text-textDim">
            <a href="/partners/apply" className="hover:text-text">Become a supplier or courier partner →</a>
          </footer>
        </BasketProvider>
      </body>
    </html>
  );
}
