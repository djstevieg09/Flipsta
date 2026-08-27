import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { getCurrentProfile } from "@/lib/currentProfile";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";
import { BasketProvider } from "./BasketProvider";
import BasketIndicator from "./components/BasketIndicator";
import HeaderSearch from "./components/HeaderSearch";
import SiteNav from "./components/SiteNav";
import SupportChatWidget from "./components/SupportChatWidget";

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
              {/* 26 Aug 2026, Steven: "change the logo in top left to the
                  attached file" — cropped to icon+wordmark (the tagline
                  doesn't read at header scale) and saved to /public/logo.png. */}
              <a href="/" className="flex items-center whitespace-nowrap shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="Flipsta" className="h-9 w-auto" />
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
            {/* 26 Aug 2026, Steven: "I dont need to see buyer wants, list an
                item, Portfolio, Wishlist and all that [in the admin
                dashboard]" — SiteNav hides itself on /admin/* routes, since
                that section has its own nav (admin/layout.tsx). */}
            <SiteNav
              isAuthed={Boolean(auth)}
              canFulfill={Boolean(auth && TIER_ENTITLEMENTS[auth.profile.subscriptionTier].canFulfill)}
              canSniper={Boolean(auth && TIER_ENTITLEMENTS[auth.profile.subscriptionTier].sniperMode)}
            />
          </header>
          <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
          <footer className="border-t border-border px-6 py-6 text-center text-xs text-textDim">
            <a href="/partners/apply" className="hover:text-text">Become a supplier or courier partner →</a>
          </footer>
          {/* 27 Aug 2026, Steven: "need a Ai chat bot that can assist with
              any quiries people may have." Floating widget, every
              non-admin page — see components/SupportChatWidget.tsx. */}
          <SupportChatWidget isAuthed={Boolean(auth)} />
        </BasketProvider>
      </body>
    </html>
  );
}
