import type { Metadata } from "next";
import "./globals.css";
import { getCurrentProfile } from "@/lib/currentProfile";

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
        <header className="sticky top-0 z-50 flex flex-col border-b border-border bg-bg/90 backdrop-blur">
          <div className="flex items-center gap-5 h-15 px-6 py-3">
            <a href="/" className="flex items-center gap-2 font-extrabold text-lg whitespace-nowrap">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-black"
                    style={{ background: "linear-gradient(135deg,#5b7cfa,#22d3ee)" }}>F</span>
              Flipsta
            </a>
            <div className="flex-1 flex justify-center">
              <div className="relative w-full max-w-md">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search opportunities, products, sellers…"
                  className="w-full bg-surface2 border border-border rounded-full py-2 pl-9 pr-4 text-sm text-text placeholder:text-textFaint focus:outline-none focus:border-brand2"
                />
              </div>
            </div>
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
            {auth && <a href="/wallet" className="px-3 py-2.5 rounded-lg hover:bg-surface2 whitespace-nowrap">Wallet</a>}
          </nav>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        <footer className="border-t border-border px-6 py-6 text-center text-xs text-textDim">
          <a href="/partners/apply" className="hover:text-text">Become a supplier or courier partner →</a>
        </footer>
      </body>
    </html>
  );
}
