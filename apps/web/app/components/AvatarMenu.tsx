"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 18 Sept 2026, Steven: "instead of an account tab, referrals, wallet, FAQ,
 * maybe put them when you click a circle with your avatar... on top right
 * it shows a drop down with these tabs in them." Replaces those four
 * SiteNav tabs (see SiteNav.tsx) with a single avatar-circle button in the
 * header that opens this dropdown. Sign out and the Staff link (previously
 * both inline in layout.tsx's header) moved in here too, since they belong
 * to the same "about you / your account" cluster rather than sitting
 * outside it.
 */
export default function AvatarMenu({
  displayName,
  tier,
  isStaff,
}: {
  displayName: string;
  tier: string;
  isStaff: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const initial = displayName?.trim().charAt(0).toUpperCase() || "?";
  const links = [
    { href: "/account", label: "Account" },
    { href: "/referrals", label: "Referrals" },
    { href: "/wallet", label: "Wallet" },
    { href: "/faq", label: "FAQ" },
  ];

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white transition hover:brightness-110"
        style={{ background: "linear-gradient(135deg,#f2b545,#ffd77a)" }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-56 card p-2 z-50 shadow-xl">
          <div className="px-2 py-1.5 border-b border-border mb-1">
            <div className="font-bold text-sm truncate">{displayName}</div>
            <div className="text-xs text-textDim capitalize">{tier} plan</div>
          </div>
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="block px-2 py-1.5 rounded-lg text-sm hover:bg-surface2 transition"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          {isStaff && (
            <a href="/admin" className="block px-2 py-1.5 rounded-lg text-sm hover:bg-surface2 transition" onClick={() => setOpen(false)}>
              Staff
            </a>
          )}
          <form action="/api/auth/signout" method="post" className="border-t border-border mt-1 pt-1">
            <button type="submit" className="w-full text-left px-2 py-1.5 rounded-lg text-sm hover:bg-surface2 transition text-red">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
