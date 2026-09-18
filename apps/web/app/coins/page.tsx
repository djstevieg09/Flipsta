"use client";

/**
 * Flippy Coins shop — 16 Sept 2026, Steven: "try again as ive just made
 * this public again" (after sharing a design reference and asking for the
 * coin shop to look like it, then the real Flippy mascot image to use).
 *
 * 18 Sept 2026, Steven: "get the flippy coins shop all working." Every
 * button here now does something real: a bundle's "Buy Now" (and the
 * hero's single-coin CTA) calls POST /api/coins/checkout and redirects to
 * Stripe Checkout; a successful payment is credited server-side by the
 * Stripe webhook (checkout.session.completed → credit_flippy_coins(), see
 * migration 0031_flippy_coins.sql) — never trusted client-side. Bundle
 * names/coins/prices come from the shared COIN_BUNDLES map
 * (packages/shared/src/constants.ts) rather than being retyped here, so
 * the price shown always matches what the API actually charges.
 *
 * Still NOT built, per planning/coin-economy-proposal.md's open
 * questions (single vs. two coin types, per-tier discounted pricing,
 * spending coins to unlock an opportunity, the free trial/daily bonus,
 * the Flippy mascot's random reward): the "Subscriber Prices" panel below
 * stays informational only — every bundle is charged the flat listed
 * price regardless of tier for now.
 */

import { useEffect, useState } from "react";
import { COIN_BUNDLES, CoinBundleId } from "@flipsta/shared";

const TIER_RATES = [
  { name: "Standard", price: "£0.75", saving: "25% saving", highlight: false },
  { name: "Pro", price: "£0.58", saving: "42% saving", highlight: false, accentBlue: true },
  { name: "Platinum", price: "£0.45", saving: "55% saving", highlight: true },
];

const BUNDLE_IDS: CoinBundleId[] = ["starter", "growth", "arbitrage", "empire"];
const POPULAR_BUNDLE: CoinBundleId = "growth";

const FEATURES = [
  {
    label: "Better Value",
    body: "More coins, lower cost per coin.",
    icon: <path d="M13 2 3 14h7l-1 8 10-12h-7z" />,
  },
  {
    label: "More Opportunities",
    body: "Unlock more sourced deals and listings.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </>
    ),
  },
  {
    label: "Bigger Trading Capacity",
    body: "Buy, sell and flip more with greater flexibility.",
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 15v3" />
        <path d="M12 10v8" />
        <path d="M17 6v12" />
      </>
    ),
  },
  {
    label: "Premium Features",
    body: "Access exclusive tools and marketplace features.",
    icon: <path d="M12 2 15 9l7 1-5 5 1.2 7L12 18.5 5.8 22 7 15 2 10l7-1z" />,
  },
];

export default function CoinsPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [busyBundle, setBusyBundle] = useState<CoinBundleId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        setSignedIn(Boolean(d.profile));
        setBalance(typeof d.profile?.flippyCoinBalance === "number" ? d.profile.flippyCoinBalance : 0);
      })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    if (params.get("purchase") === "success") {
      setNotice("Payment received — your Flippy Coins will land in your balance within a few seconds.");
    } else if (params.get("purchase") === "cancelled") {
      setNotice("Checkout cancelled — no payment was taken.");
    }
  }, []);

  async function buy(bundleId: CoinBundleId) {
    setError(null);
    setBusyBundle(bundleId);
    try {
      const res = await fetch("/api/coins/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't start checkout right now.");
        setBusyBundle(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't start checkout right now.");
      setBusyBundle(null);
    }
  }

  const single = COIN_BUNDLES.single;

  return (
    <div className="space-y-10">
      {notice && <div className="card text-sm">{notice}</div>}
      {error && <div className="card text-sm text-red">{error}</div>}

      {!signedIn && (
        <div className="card text-sm">
          <a className="underline" href="/login">Sign in</a> to buy Flippy Coins.
        </div>
      )}

      {/* HERO */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid md:grid-cols-2 gap-8 items-center p-8 md:p-12">
          <div>
            <div className="text-xs font-bold tracking-[2px] text-gold mb-3">FLIPSTA FLIPPY COINS</div>
            <h1 className="text-3xl md:text-4xl font-extrabold leading-tight mb-3">
              The currency of the <span className="text-gold">Flipsta</span> marketplace.
            </h1>
            <div className="text-xl font-bold mb-4">
              Find it. <span className="text-gold">Flip it.</span> Profit.
            </div>
            <p className="text-textDim text-sm leading-relaxed max-w-md mb-6">
              Buy Flippy Coins to unlock opportunities, purchase listings, access premium
              deals and take part in the Flipsta ecosystem.
            </p>
            {signedIn && balance !== null && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl hero-spin" aria-hidden>🪙</span>
                <span className="text-sm text-textDim">
                  Your balance: <span className="font-extrabold text-text">{balance.toLocaleString()} Flippy Coins</span>
                </span>
              </div>
            )}
            <button
              type="button"
              disabled={!signedIn || busyBundle !== null}
              onClick={() => buy("single")}
              className="btn bg-gold text-bg disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
              </svg>
              {busyBundle === "single" ? "Redirecting…" : `Buy 1 Flippy Coin — £${single.priceGBP.toFixed(2)}`}
            </button>
          </div>
          <div className="flex items-center justify-center relative">
            <div
              className="absolute w-72 h-72 rounded-full blur-2xl opacity-30"
              style={{ background: "radial-gradient(circle, #f2b545 0%, transparent 70%)" }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/flippy-mascot.jpg"
              alt="Flippy, the Flipsta mascot"
              className="relative w-full max-w-xs rounded-2xl"
            />
            <span className="absolute top-6 left-4 text-3xl select-none hero-spin" aria-hidden>🪙</span>
            <span className="absolute bottom-10 right-2 text-2xl select-none hero-bob" aria-hidden>🪙</span>
            <span className="absolute top-1/2 -right-2 text-2xl select-none hero-sway" style={{ animationDelay: "0.3s" }} aria-hidden>💰</span>
          </div>
        </div>
      </div>

      {/* PRICE PANELS */}
      <div className="grid md:grid-cols-[1fr_1.7fr] gap-5">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gold flex items-center justify-center shrink-0">
            <span className="font-extrabold text-bg text-lg">F</span>
          </div>
          <div>
            <div className="font-bold text-sm">Flippy Coins</div>
            <div className="text-xs text-textDim mb-2">One token. Endless opportunities.</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-gold">£{single.priceGBP.toFixed(2)}</span>
              <span className="text-xs text-textDim">per coin</span>
            </div>
            <div className="text-[11px] text-textFaint">(Standard Price)</div>
          </div>
        </div>

        <div className="card">
          <div className="mb-4">
            <div className="font-bold text-sm">Subscriber Prices</div>
            <div className="text-xs text-textDim">The more you subscribe, the more you save.</div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {TIER_RATES.map((t) => (
              <div
                key={t.name}
                className="rounded-lg border p-3"
                style={{ borderColor: t.highlight ? "#f2b545" : t.accentBlue ? "#5b7cfa88" : "#262f4a" }}
              >
                <div className="text-xs text-textDim mb-1">{t.name}</div>
                <div className={`text-xl font-extrabold ${t.highlight ? "text-gold" : ""}`}>{t.price}</div>
                <div className="text-[11px] text-textDim mb-2">per coin</div>
                <span
                  className="inline-block text-[10px] font-bold px-2 py-1 rounded-full"
                  style={{
                    background: t.highlight ? "#f2b54530" : t.accentBlue ? "#5b7cfa30" : "#ffffff14",
                    color: t.highlight ? "#f2b545" : t.accentBlue ? "#8fb0ff" : "#c7c7cc",
                  }}
                >
                  {t.saving}
                </span>
              </div>
            ))}
          </div>
          {/* 18 Sept 2026 — these rates aren't wired to real pricing yet
              (see the file doc-comment above): every bundle below charges
              the same flat price regardless of tier for now. */}
          <p className="text-[11px] text-textFaint mt-3">Subscriber pricing is coming soon — every bundle below is charged the standard price shown for now.</p>
        </div>
      </div>

      {/* COIN BUNDLES */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f2b545" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="6" rx="8" ry="3" />
            <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
            <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
          </svg>
          <span className="text-xl font-extrabold">Coin Bundles</span>
        </div>
        <div className="text-sm text-textDim mb-5">The more you buy, the better the value.</div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {BUNDLE_IDS.map((id) => {
            const b = COIN_BUNDLES[id];
            const popular = id === POPULAR_BUNDLE;
            return (
              <div
                key={id}
                className="card relative flex flex-col gap-3"
                style={popular ? { borderColor: "#f2b545", borderWidth: 2 } : undefined}
              >
                {popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-bg text-[10px] font-bold tracking-wide px-3 py-1 rounded-full whitespace-nowrap">
                    MOST POPULAR
                  </div>
                )}
                <div className={popular ? "mt-1.5" : undefined}>
                  <div className="font-bold text-sm">{b.name}</div>
                  <div className="text-gold font-extrabold text-lg">{b.coins} Coins</div>
                </div>
                <div className="border-t border-border pt-3 flex items-baseline justify-between">
                  <span className="text-xs text-textDim">Price</span>
                  <span className="text-xl font-extrabold">£{b.priceGBP.toFixed(2)}</span>
                </div>
                <button
                  type="button"
                  disabled={!signedIn || busyBundle !== null}
                  onClick={() => buy(id)}
                  className="btn bg-gold text-bg disabled:opacity-60 disabled:cursor-not-allowed w-full justify-center inline-flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
                  </svg>
                  {busyBundle === id ? "Redirecting…" : "Buy Now"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-textFaint mt-4">
          Subscribers also receive their monthly Flippy Coin allowance at their tier&apos;s per-coin rate
          shown above — these bundles are for topping up beyond that allowance.
        </p>
      </div>

      {/* FEATURES STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-b border-border py-6">
        {FEATURES.map((f) => (
          <div key={f.label} className="flex flex-col items-center text-center gap-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f2b545" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {f.icon}
            </svg>
            <div className="font-bold text-sm">{f.label}</div>
            <div className="text-xs text-textDim">{f.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
