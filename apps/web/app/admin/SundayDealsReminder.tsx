"use client";

import { useEffect, useState } from "react";

/**
 * 26 Aug 2026, Steven: "In the admin dashboard i need a remider to check
 * deals, say every sunday at midday." Paired with a separate scheduled
 * message (Claude sends a Sunday-noon nudge, set up the same day) — this is
 * the "I'm actually looking at the dashboard" companion: shows automatically
 * whenever an admin visits any /admin page on a Sunday. No dismiss state or
 * new table needed — it naturally stops showing once the day ends, and
 * comes back next Sunday on its own.
 *
 * Deliberately a client component doing the day check in useEffect, not in
 * AdminLayout's server render — the server (Render, likely UTC) and the
 * admin's actual local day can disagree right around a day boundary, and
 * computing this client-side avoids that mismatch entirely.
 */
export default function SundayDealsReminder() {
  const [isSunday, setIsSunday] = useState(false);

  useEffect(() => {
    setIsSunday(new Date().getDay() === 0);
  }, []);

  if (!isSunday) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
      <div className="text-sm">
        <span className="font-bold">🗓️ Weekly deals check</span> — take a look at new opportunities and shop items:
        pricing looks right, any items waiting on a photo, and anything flagged in Risk &amp; Fraud.
      </div>
      <div className="flex gap-2 shrink-0">
        <a
          href="/opportunities"
          className="text-xs font-bold border border-border rounded-full px-3 py-1.5 hover:border-brand2 whitespace-nowrap"
        >
          Opportunities
        </a>
        <a
          href="/admin/shop-photos"
          className="text-xs font-bold border border-border rounded-full px-3 py-1.5 hover:border-brand2 whitespace-nowrap"
        >
          Shop photos
        </a>
        <a
          href="/admin/risk"
          className="text-xs font-bold border border-border rounded-full px-3 py-1.5 hover:border-brand2 whitespace-nowrap"
        >
          Risk &amp; Fraud
        </a>
      </div>
    </div>
  );
}
