"use client";

import { useBasket } from "../BasketProvider";

/** Header basket icon/count — 26 Aug 2026, Steven's "basket" ask. */
export default function BasketIndicator() {
  const { count } = useBasket();
  return (
    <a href="/basket" className="relative flex items-center px-2 py-1.5 text-textDim hover:text-text transition" aria-label="Basket">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#f2b545,#ffd77a)" }}
        >
          {count}
        </span>
      )}
    </a>
  );
}
