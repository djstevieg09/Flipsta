"use client";

import { useEffect, useState } from "react";

/**
 * 18 Sept 2026, Steven: "need to get the coins working with the wallet
 * amount showing in the top right hand corner with the flipsta coin
 * spinning next to the amount." Sits in the header (layout.tsx) next to
 * AvatarMenu, for every signed-in user. Reads the real, tamper-proof
 * balance from GET /api/me (profiles.flippy_coin_balance — see migration
 * 0031_flippy_coins.sql), not a guess. Re-fetches on window focus so a
 * balance that changed in another tab (or just after a Stripe purchase
 * redirect back to /coins) doesn't sit stale in the header indefinitely.
 */
export default function CoinBalance() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/me")
        .then((r) => r.json())
        .then((d) => setBalance(typeof d.profile?.flippyCoinBalance === "number" ? d.profile.flippyCoinBalance : 0))
        .catch(() => {});
    }
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  if (balance === null) return null;

  return (
    <a
      href="/coins"
      className="flex items-center gap-1.5 rounded-full border border-border bg-surface2 px-3 py-1.5 text-sm font-bold hover:border-gold transition shrink-0 whitespace-nowrap"
      title="Buy more Flippy Coins"
    >
      <span className="inline-block text-base hero-spin" aria-hidden>🪙</span>
      {balance.toLocaleString()}
    </a>
  );
}
