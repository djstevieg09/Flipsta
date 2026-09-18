import { createDb } from "../db.js";
import { sendPromoBroadcastEmail } from "@flipsta/shared";

/**
 * 18 Sept 2026, Steven: "...and promo stuff." Staff compose a broadcast
 * from /admin/broadcasts (subject + body + audience), which inserts a
 * 'pending' row into promo_broadcasts (migration 0037) — this job is what
 * actually resolves the recipient list and sends, same "admin edits the
 * real thing, the worker acts on it" split as discovery_focus/
 * seasonal_events/trending_signals feeding discoverOpportunities.ts.
 * Doing the real send here (not synchronously in the API route) avoids a
 * web request timing out trying to email a whole user base at once.
 *
 * Picks up one pending broadcast per run — Flipsta's user base is small
 * enough for a single run's worth of Resend calls to comfortably finish
 * inside this job's own interval (see index.ts), so there's no batching/
 * pagination-across-runs complexity yet; worth revisiting if that stops
 * being true (INFRASTRUCTURE_TODO.md is the place to log that when it
 * comes up).
 */
export async function sendPromoBroadcasts() {
  const db = createDb();

  const { data: pending, error } = await db
    .from("promo_broadcasts")
    .select("id, subject, body, audience, html_body")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    console.error("[sendPromoBroadcasts] Failed loading pending broadcasts:", error.message);
    return { sent: 0 };
  }
  if (!pending || pending.length === 0) return { sent: 0 };

  const broadcast = pending[0];
  await db.from("promo_broadcasts").update({ status: "sending" }).eq("id", broadcast.id);

  try {
    // audience: 'opted_in' (default) only reaches profiles that haven't
    // switched notify_promotions off — 'all' is an intentional override
    // for e.g. a mandatory service announcement, used sparingly.
    let query = db.from("profiles").select("id, notify_promotions, display_name");
    if (broadcast.audience === "opted_in") query = query.eq("notify_promotions", true);
    const { data: recipients, error: recipientsError } = await query;
    if (recipientsError) throw new Error(recipientsError.message);

    let sent = 0;
    for (const recipient of recipients ?? []) {
      try {
        const { data: userRes } = await db.auth.admin.getUserById(recipient.id);
        const email = userRes?.user?.email;
        if (email) {
          // {{FirstName}} lets one stored broadcast (e.g. the 18 Sept 2026
          // welcome-template blast, migration 0038) personalise per
          // recipient instead of baking one name into a single shared row.
          const firstName = (recipient.display_name || "there").trim().split(/\s+/)[0] || "there";
          const subject = broadcast.subject.split("{{FirstName}}").join(firstName);
          const body = broadcast.body.split("{{FirstName}}").join(firstName);
          const html = broadcast.html_body ? broadcast.html_body.split("{{FirstName}}").join(firstName) : undefined;
          await sendPromoBroadcastEmail(email, subject, body, html);
          sent++;
        }
      } catch (e) {
        console.error(`[sendPromoBroadcasts] Failed sending to profile ${recipient.id}:`, e instanceof Error ? e.message : e);
      }
    }

    await db
      .from("promo_broadcasts")
      .update({ status: "sent", recipient_count: sent, sent_at: new Date().toISOString() })
      .eq("id", broadcast.id);
    return { sent };
  } catch (e) {
    console.error(`[sendPromoBroadcasts] Failed for broadcast ${broadcast.id}:`, e instanceof Error ? e.message : e);
    await db.from("promo_broadcasts").update({ status: "failed" }).eq("id", broadcast.id);
    return { sent: 0 };
  }
}
