import { createDb } from "../db.js";
import { NotificationEvents } from "@flipsta/shared";

/**
 * 27 Aug 2026, Steven: "go away and look at proven selling techniques...
 * what makes it almost addictive to keep coming back." Researched (see
 * claude/deployment-checklist.md's #-5 section) and scoped via
 * AskUserQuestion — this is the missing "Trigger" stage of the Hook Model:
 * something outside the site that pulls a shopper back, grounded in real
 * data (never an invented "you might like this" blast — see the CMA/ICO
 * dark-patterns research in the same section for why that distinction
 * matters).
 *
 * Two independent, genuinely real match signals against every shop_item
 * that's newly landed (available, has a photo, created recently):
 * 1. It matches something the shopper actually put on their wishlist
 *    (loosely normalized name match — same normalizeProductName idea as
 *    discoverOpportunities.ts's dedup, just inlined here rather than
 *    importing across apps).
 * 2. It has a size (see migration 0018/AI-found-items-capture-sizes) that
 *    matches a size the shopper actually set on one of their own
 *    shopper_profiles — deliberately a plain string match across whichever
 *    size field it lands on, not scoped by category, to avoid needing a
 *    new category->size-type mapping table; a false positive here just
 *    means an email about something not quite their thing, not a fake
 *    claim about anything (worth tightening later if it turns out noisy).
 *
 * One email per shopper per run, listing everything that matched — never
 * one email per item, which would just be spam. notification_log's unique
 * constraint is what actually guarantees no repeat email for the same
 * (profile, item) pair even if this job runs again before the item sells;
 * the "created recently" window below is just a cheap first filter, not
 * the source of truth for idempotency.
 */
const LOOKBACK_HOURS = 6;

function normalizeProductName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function notifyDealMatches() {
  const db = createDb();

  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const { data: newItems, error: itemsError } = await db
    .from("shop_items")
    .select("id, product_name, our_price_gbp, size, created_at")
    .eq("status", "available")
    .not("image_url", "is", null)
    .gte("created_at", sinceIso);
  if (itemsError) {
    console.error("[notifyDealMatches] Failed loading recent shop_items:", itemsError.message);
    return { itemsChecked: 0, profilesNotified: 0 };
  }
  if (!newItems || newItems.length === 0) return { itemsChecked: 0, profilesNotified: 0 };

  const [{ data: wishlistItems }, { data: shopperProfiles }] = await Promise.all([
    db.from("wishlist_items").select("profile_id, product_name"),
    db.from("shopper_profiles").select("profile_id, shoe_size_uk, top_size, bottom_size, kids_shoe_size_uk, kids_clothing_size"),
  ]);

  // itemId -> Map<profileId, reason>
  const matchesByItem = new Map<string, Map<string, string>>();

  for (const item of newItems) {
    const matched = new Map<string, string>();
    const normName = normalizeProductName(item.product_name);

    for (const w of wishlistItems ?? []) {
      if (normalizeProductName(w.product_name) === normName) matched.set(w.profile_id, "on your wishlist");
    }

    if (item.size) {
      for (const p of shopperProfiles ?? []) {
        if (matched.has(p.profile_id)) continue; // wishlist match already covers this profile
        const sizes = [p.shoe_size_uk, p.top_size, p.bottom_size, p.kids_shoe_size_uk, p.kids_clothing_size];
        if (sizes.some((s) => s && s === item.size)) matched.set(p.profile_id, `matches your saved size (${item.size})`);
      }
    }

    if (matched.size > 0) matchesByItem.set(item.id, matched);
  }

  if (matchesByItem.size === 0) return { itemsChecked: newItems.length, profilesNotified: 0 };

  const itemIds = [...matchesByItem.keys()];
  const { data: alreadySent } = await db.from("notification_log").select("profile_id, shop_item_id").in("shop_item_id", itemIds);
  const sentSet = new Set((alreadySent ?? []).map((r) => `${r.profile_id}:${r.shop_item_id}`));

  type Match = { itemId: string; productName: string; priceGBP: number; reason: string };
  const byProfile = new Map<string, Match[]>();
  for (const [itemId, matched] of matchesByItem) {
    const item = newItems.find((i) => i.id === itemId)!;
    for (const [profileId, reason] of matched) {
      if (sentSet.has(`${profileId}:${itemId}`)) continue;
      const list = byProfile.get(profileId) ?? [];
      list.push({ itemId, productName: item.product_name, priceGBP: item.our_price_gbp, reason });
      byProfile.set(profileId, list);
    }
  }
  if (byProfile.size === 0) return { itemsChecked: newItems.length, profilesNotified: 0 };

  const profileIds = [...byProfile.keys()];
  const { data: profiles } = await db.from("profiles").select("id, notify_deal_matches").in("id", profileIds);
  const optedIn = new Set((profiles ?? []).filter((p) => p.notify_deal_matches).map((p) => p.id));

  let profilesNotified = 0;
  for (const [profileId, matches] of byProfile) {
    if (!optedIn.has(profileId)) continue;
    try {
      const { data: userRes } = await db.auth.admin.getUserById(profileId);
      const email = userRes?.user?.email;
      if (email) {
        await NotificationEvents.dealMatch(
          email,
          matches.map((m) => ({ productName: m.productName, priceGBP: m.priceGBP, reason: m.reason })),
        );
        profilesNotified++;
      }
      // Log regardless of whether a real email address was resolved — the
      // stub path in packages/shared/src/notifications.ts (no RESEND_API_KEY
      // set) still "sends" successfully, and either way this guarantees no
      // repeat attempt for the same (profile, item) pair next run.
      const { error: logError } = await db
        .from("notification_log")
        .insert(matches.map((m) => ({ profile_id: profileId, shop_item_id: m.itemId, kind: "deal_match" })));
      if (logError) console.error(`[notifyDealMatches] Failed logging sent notifications for ${profileId}:`, logError.message);
    } catch (e) {
      console.error(`[notifyDealMatches] Failed for profile ${profileId}:`, e instanceof Error ? e.message : e);
    }
  }

  return { itemsChecked: newItems.length, profilesNotified };
}
