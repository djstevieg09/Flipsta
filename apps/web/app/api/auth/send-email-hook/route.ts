import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { NotificationEvents } from "@flipsta/shared";

// Force-dynamic — Supabase calls this with a fresh signed payload every time.
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/send-email-hook
 *
 * 19 Sept 2026, Steven: "the confirm email address on signing up is being
 * sent from supabase and very confusing... make it so the welcome email we
 * have has the link to confirm email address on it." This is Supabase's
 * "Send Email" Auth Hook target — once wired up in the Supabase dashboard
 * (Authentication → Hooks → Send Email, see INFRASTRUCTURE_TODO.md #22),
 * Supabase stops sending its own built-in auth emails (confirm signup,
 * password reset, magic link, email change, invite) entirely and calls
 * this route instead, handing us the real verification token so we can
 * send our own on-brand email via Resend. Until Steven does that one-time
 * dashboard step, this route just sits here unused — Supabase keeps
 * sending its default emails exactly as before, so shipping this code is
 * safe on its own.
 *
 * Payload/response shape and the standardwebhooks signature scheme are
 * Supabase's own documented contract, not something invented here — see
 * https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook.
 *
 * Failure-mode decision, deliberately different from Supabase's own sample
 * code: a bad/missing signature is rejected (401) since that's a genuine
 * security check. But if the signature is valid and Resend itself fails
 * (API down, rate limited, etc.), this still returns 200 rather than an
 * error — because unlike Supabase's example, a non-200 here blocks the
 * underlying auth action for the user (no confirmation email AND signup
 * itself fails). A Resend hiccup should degrade to "the email didn't
 * arrive" (same as today, recoverable via /forgot-password or contact
 * support), never to "nobody can create a Flipsta account." Same
 * fail-open-but-log philosophy as every other optional integration in this
 * codebase (see e.g. lib/stripe.ts, lib/notifications.ts).
 */
export async function POST(req: NextRequest) {
  const rawSecret = process.env.SUPABASE_AUTH_HOOK_SECRET;
  if (!rawSecret) {
    // Not configured yet. Reject rather than silently accepting an
    // unverified request — this route can trigger a real Resend send, so it
    // must never run without signature verification. Supabase won't be
    // calling this URL at all until the hook is switched on in its
    // dashboard, so this only fires if someone hits the URL directly.
    return NextResponse.json({ error: { http_code: 500, message: "Auth hook secret not configured." } }, { status: 500 });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  // Supabase's dashboard gives the secret prefixed "v1,whsec_..." — the
  // standardwebhooks library wants just the whsec_ value, same as
  // Supabase's own sample code for this hook.
  const wh = new Webhook(rawSecret.replace("v1,whsec_", ""));

  let verified: {
    user: { id: string; email: string; user_metadata?: Record<string, unknown> };
    email_data: {
      token_hash: string;
      redirect_to: string;
      email_action_type: string;
      site_url: string;
    };
  };
  try {
    verified = wh.verify(payload, headers) as typeof verified;
  } catch (err) {
    return NextResponse.json(
      { error: { http_code: 401, message: `Invalid webhook signature: ${err instanceof Error ? err.message : String(err)}` } },
      { status: 401 },
    );
  }

  const { user, email_data } = verified;
  const displayName = typeof user.user_metadata?.display_name === "string" ? (user.user_metadata!.display_name as string) : "there";

  // 19 Sept 2026 fix — this USED to link straight at
  // `${email_data.site_url}/auth/v1/verify`, on the mistaken assumption
  // that site_url was Supabase's own API base URL. It's actually the app's
  // own configured Site URL (flipsta.co.uk), so that link pointed at our
  // domain's non-existent /auth/v1/verify path and silently never verified
  // anything ("no spi found" — see app/auth/confirm/route.ts for the full
  // writeup). Now points at our own /auth/confirm route instead, which
  // verifies token_hash server-side — more robust than Supabase's raw
  // verify endpoint too, since it doesn't depend on the PKCE code_verifier
  // from whichever browser/device started the flow.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || email_data.site_url;
  let nextPath: string;
  if (email_data.email_action_type === "signup") {
    // signUp() sets no emailRedirectTo, so email_data.redirect_to is just
    // Supabase's default Site URL root — send freshly-confirmed signups
    // somewhere more useful instead.
    nextPath = "/opportunities";
  } else {
    try {
      const redirectUrl = new URL(email_data.redirect_to);
      nextPath = redirectUrl.pathname + redirectUrl.search;
    } catch {
      nextPath = "/";
    }
  }
  const confirmUrl = `${siteUrl}/auth/confirm?token_hash=${encodeURIComponent(email_data.token_hash)}&type=${encodeURIComponent(email_data.email_action_type)}&next=${encodeURIComponent(nextPath)}`;

  try {
    switch (email_data.email_action_type) {
      case "signup": {
        await NotificationEvents.confirmSignup(user.email, displayName, confirmUrl);
        // Stop sendWelcomeEmails.ts's periodic job sending its own separate
        // welcome email later — this one already covers it. Best-effort:
        // if the profile row hasn't been created by the on_auth_user_created
        // trigger yet, this just affects 0 rows and the worker job (which
        // still exists as a fallback) sends its own welcome email later.
        try {
          const supabase = createSupabaseServiceClient();
          await supabase
            .from("profiles")
            .update({ welcome_email_sent_at: new Date().toISOString() })
            .eq("id", user.id)
            .is("welcome_email_sent_at", null);
        } catch (e) {
          console.error("[send-email-hook] Failed marking welcome_email_sent_at:", e instanceof Error ? e.message : e);
        }
        break;
      }
      case "recovery":
        await NotificationEvents.passwordReset(user.email, confirmUrl);
        break;
      case "magiclink":
        await NotificationEvents.magicLink(user.email, confirmUrl);
        break;
      case "email_change":
        await NotificationEvents.confirmEmailChange(user.email, confirmUrl);
        break;
      case "invite":
        await NotificationEvents.invite(user.email, confirmUrl);
        break;
      default:
        // Anything else Supabase might send (reauthentication, the various
        // *_notification events) has no template yet — skip rather than
        // guess at content. Returning success still lets the underlying
        // auth action complete normally.
        break;
    }
  } catch (err) {
    // See the file-header comment: log and still return 200 so a Resend
    // outage degrades to "no email" rather than "signup is down."
    console.error("[send-email-hook] Failed sending email:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({});
}
