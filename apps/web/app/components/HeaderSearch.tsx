"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * 26 Aug 2026, Steven: "catagories and basket and all that jazz" — the
 * header search box (Section 12.3's layout convention) has been purely
 * decorative until now. Wired here to /shop's own ?q= filter rather than a
 * new backend search endpoint — the shop catalogue is small enough for
 * client-side substring filtering (see /shop/page.tsx), so this just
 * navigates and lets that page do the matching.
 */
export default function HeaderSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    router.push(trimmed ? `/shop?q=${encodeURIComponent(trimmed)}` : "/shop");
  }

  return (
    <form onSubmit={onSubmit} className="relative w-full max-w-md">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search the shop…"
        className="w-full bg-surface2 border border-border rounded-full py-2 pl-9 pr-4 text-sm text-text placeholder:text-textFaint focus:outline-none focus:border-brand2"
      />
    </form>
  );
}
