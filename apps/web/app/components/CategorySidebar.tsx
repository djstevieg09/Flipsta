"use client";

import { useState } from "react";

type Category = { id: string; name: string; slug: string };

/**
 * 26 Aug 2026, Steven: "Need the catagories to be in an hamburger
 * collapsable menu on the left." Replaces the horizontal pill row /shop
 * used to have — same underlying selectedCategory state and onSelect
 * callback, just a collapsible left sidebar instead of pills across the
 * top, so a long category list doesn't crowd out the page on mobile.
 * Shared component so the homepage's "latest deals" section can reuse the
 * exact same nav instead of a second copy.
 */
export default function CategorySidebar({
  categories,
  categoriesLoading,
  categoriesError,
  selectedCategory,
  onSelect,
}: {
  categories: Category[];
  categoriesLoading: boolean;
  categoriesError: string | null;
  selectedCategory: string | null;
  onSelect: (slug: string | null) => void;
}) {
  // Open by default on desktop-width screens, collapsed on narrow ones —
  // window is only available client-side, and this component is already
  // "use client", so this is safe at initial render (no SSR/client
  // mismatch risk since the whole subtree only ever renders in the browser).
  const [open, setOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);

  return (
    <div className={`shrink-0 ${open ? "w-full md:w-52" : "w-auto"}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs font-bold border border-border rounded-lg px-3 py-2 hover:border-brand2 mb-2"
        aria-expanded={open}
        aria-label={open ? "Collapse categories" : "Expand categories"}
      >
        <span aria-hidden="true">☰</span>
        Categories
      </button>

      {open && (
        <div className="space-y-1">
          {categoriesError && <p className="text-xs text-red">Couldn&apos;t load categories: {categoriesError}</p>}
          {!categoriesLoading && !categoriesError && categories.length === 0 && (
            <p className="text-xs text-textFaint">No categories are set up yet.</p>
          )}
          <button
            onClick={() => onSelect(null)}
            className={`block w-full text-left text-sm font-bold rounded-lg px-3 py-2 transition ${
              selectedCategory === null ? "bg-surface2 text-brand2" : "text-textDim hover:bg-surface2 hover:text-text"
            }`}
          >
            All categories
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.slug)}
              className={`block w-full text-left text-sm font-bold rounded-lg px-3 py-2 transition ${
                selectedCategory === c.slug ? "bg-surface2 text-brand2" : "text-textDim hover:bg-surface2 hover:text-text"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
