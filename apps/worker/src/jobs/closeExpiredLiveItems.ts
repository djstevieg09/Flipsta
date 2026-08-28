import { createDb } from "../db.js";

/**
 * 27 Aug 2026 — settles a live_show_items row once its bidding clock
 * (ends_at) has passed, same "the auction is whatever's highest when the
 * clock runs out" mechanic as closeExpiredAuctions.ts. Unlike that job,
 * winning a live-show item IS the purchase (not just the right to list it
 * later) — creating the real order/Stripe PaymentIntent means calling
 * Stripe, and per the design note already in releaseEscrow.ts, "the Stripe
 * SDK stays in one place" (the web app) — so the actual settlement (who
 * won, creating the order) happens via a POST to the web app's
 * INTERNAL_API_SECRET-authenticated /api/internal/live-shows/settle-item,
 * not directly here. This job's only responsibility is finding which items
 * need settling and calling that endpoint once each.
 */
export async function closeExpiredLiveItems() {
  const db = createDb();
  const nowIso = new Date().toISOString();
  const webAppUrl = process.env.WEB_APP_INTERNAL_URL;
  const secret = process.env.INTERNAL_API_SECRET;

  if (!webAppUrl || !secret) {
    // Not configured yet — same "quietly skip, don't crash the whole
    // worker" stance as every other not-yet-configured integration in this
    // codebase (isStripeConfigured, isClaudeSearchConfigured, etc).
    return { checked: 0, settled: 0, skipped: "WEB_APP_INTERNAL_URL / INTERNAL_API_SECRET not configured" };
  }

  const { data: expired } = await db
    .from("live_show_items")
    .select("id")
    .eq("status", "active")
    .lt("ends_at", nowIso);

  let settled = 0;
  for (const item of expired ?? []) {
    try {
      const res = await fetch(`${webAppUrl}/api/internal/live-shows/settle-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": secret },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (res.ok) {
        settled++;
      } else {
        const body = await res.text();
        console.error(`[closeExpiredLiveItems] settle-item failed for ${item.id}: ${res.status} ${body}`);
      }
    } catch (e) {
      console.error(`[closeExpiredLiveItems] settle-item request failed for ${item.id}:`, e instanceof Error ? e.message : e);
    }
  }

  return { checked: expired?.length ?? 0, settled };
}
