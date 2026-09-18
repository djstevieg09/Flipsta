import { createDb } from "../db.js";
import { NotificationEvents } from "@flipsta/shared";

/**
 * 18 Sept 2026, Steven: "i need to setup resend so it can send emails for
 * sign ups." Signup itself is a client-side supabase.auth.signUp() call
 * (apps/web/app/signup/page.tsx) with no server hook Flipsta controls, and
 * profile creation happens via a Postgres trigger — neither is a place
 * that can safely hold a Resend API key or survive a slow email API call.
 * So, same pattern as notifyDealMatches.ts: a periodic worker job finds
 * profiles that haven't been welcomed yet and sends the email itself.
 *
 * welcome_email_sent_at (migration 0037) is the idempotency marker — set
 * the moment an email is attempted (real or stub), never retried, exactly
 * like notification_log guarantees notifyDealMatches never double-sends.
 * Runs every few minutes (see apps/worker/src/index.ts) so it still feels
 * prompt without needing a real-time hook.
 */
export async function sendWelcomeEmails() {
  const db = createDb();

  const { data: unwelcomed, error } = await db
    .from("profiles")
    .select("id, display_name")
    .is("welcome_email_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    console.error("[sendWelcomeEmails] Failed loading unwelcomed profiles:", error.message);
    return { sent: 0 };
  }
  if (!unwelcomed || unwelcomed.length === 0) return { sent: 0 };

  let sent = 0;
  for (const profile of unwelcomed) {
    try {
      const { data: userRes } = await db.auth.admin.getUserById(profile.id);
      const email = userRes?.user?.email;
      if (email) {
        await NotificationEvents.welcome(email, profile.display_name || "there");
      }
      // Mark as welcomed regardless of whether a real email address was
      // resolved (mirrors notifyDealMatches.ts's reasoning) — otherwise a
      // profile with no resolvable auth user would be retried forever.
      const { error: updateError } = await db
        .from("profiles")
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq("id", profile.id);
      if (updateError) {
        console.error(`[sendWelcomeEmails] Failed marking ${profile.id} as welcomed:`, updateError.message);
        continue;
      }
      sent++;
    } catch (e) {
      console.error(`[sendWelcomeEmails] Failed for profile ${profile.id}:`, e instanceof Error ? e.message : e);
    }
  }

  return { sent };
}
