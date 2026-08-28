import { createDb } from "../db.js";

/**
 * 27 Aug 2026, Steven: "we also need an oppotunity to issue a free months
 * subscription or mulitples of." Reverts a profile's subscription_tier
 * back to whatever it was before an admin's free-month grant
 * (api/admin/subscription-grant/route.ts), once
 * subscription_tier_grant_expires_at has passed. See migration 0027's
 * comments for the full design, including the already-accepted sharp edge
 * shared with the pre-existing "Override -> Elite" tier-override button: a
 * real Stripe webhook firing mid-grant already silently overwrites/ends a
 * grant early, and this job doesn't change that.
 */
export async function revertExpiredSubscriptionGrants() {
  const db = createDb();
  const nowIso = new Date().toISOString();

  const { data: expired } = await db
    .from("profiles")
    .select("id, subscription_tier_before_grant")
    .not("subscription_tier_grant_expires_at", "is", null)
    .lt("subscription_tier_grant_expires_at", nowIso);

  let reverted = 0;
  for (const profile of expired ?? []) {
    await db
      .from("profiles")
      .update({
        subscription_tier: profile.subscription_tier_before_grant ?? "free",
        subscription_tier_before_grant: null,
        subscription_tier_grant_expires_at: null,
      })
      .eq("id", profile.id);
    reverted++;
  }

  return { checked: expired?.length ?? 0, reverted };
}
