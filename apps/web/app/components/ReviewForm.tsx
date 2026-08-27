"use client";

import { useState } from "react";

/**
 * 27 Aug 2026 — real trust-signal research (see
 * claude/deployment-checklist.md's #-5 section): a small inline star-rating
 * + optional comment form, reused wherever Portfolio lets a buyer review
 * something they actually bought (a peer-marketplace order via the
 * pre-existing /api/reviews, or a Flipsta-sourced shop_item/opportunity via
 * the new /api/product-reviews — see migration 0021's comment on why
 * those are two separate endpoints/tables).
 */
export default function ReviewForm({ onSubmit }: { onSubmit: (rating: number, body: string) => Promise<string | null> }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const errorMessage = await onSubmit(rating, body);
    setSubmitting(false);
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    setDone(true);
  }

  if (done) return <div className="text-xs text-green">Thanks — your review is live.</div>;

  return (
    <div className="border-t border-border pt-2 mt-1 space-y-1.5">
      <div className="flex gap-0.5" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            className="text-lg leading-none"
          >
            {n <= rating ? "★" : "☆"}
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Optional — what was it like?"
        rows={2}
        className="w-full bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs"
      />
      {error && <p className="text-[10px] text-red">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting}
        className="text-xs font-bold border border-border rounded-lg px-3 py-1.5 hover:border-brand2 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit review"}
      </button>
    </div>
  );
}
