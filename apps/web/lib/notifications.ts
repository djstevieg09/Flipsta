/**
 * Section 12.5 — Notifications. Not previously wired in at all (STATUS.md
 * flagged this as a gap). Email at minimum, from launch: auction win/outbid
 * alerts, buyback claim status changes, ticket updates, order status
 * changes. This wraps Resend (a good fit for a Next.js app per the
 * infrastructure checklist) behind one function so call sites don't care
 * which provider is behind it.
 *
 * Needs RESEND_API_KEY set — see INFRASTRUCTURE_TODO.md. Falls back to a
 * clearly-labelled console stub in dev, same pattern as apps/web/lib/stripe.ts,
 * so every call site is exercisable without a real email account configured.
 */
const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.NOTIFICATIONS_FROM_EMAIL ?? "Flipsta <notifications@flipsta.co.uk>";

export function isEmailConfigured(): boolean {
  return Boolean(apiKey);
}

export async function sendNotificationEmail(params: { to: string; subject: string; body: string }) {
  if (!isEmailConfigured()) {
    console.log("[notifications] (stub — set RESEND_API_KEY to send for real)", {
      to: params.to,
      subject: params.subject,
    });
    return { id: `email_stub_${crypto.randomUUID()}`, stub: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromAddress, to: params.to, subject: params.subject, text: params.body }),
  });
  if (!res.ok) {
    console.error("[notifications] Resend call failed:", res.status, await res.text());
  }
  return res.json();
}

/** Convenience wrappers for the event types Section 12.5 calls out by name. */
export const NotificationEvents = {
  ticketUpdated: (to: string, ticketId: string, status: string) =>
    sendNotificationEmail({
      to,
      subject: `Update on your Flipsta ticket ${ticketId}`,
      body: `Your support ticket ${ticketId} is now: ${status}. Reply from your Flipsta account to add more detail.`,
    }),
  buybackClaimStatus: (to: string, itemDescription: string, status: string) =>
    sendNotificationEmail({
      to,
      subject: `Buyback claim update — ${itemDescription}`,
      body: `Your buyback claim for "${itemDescription}" is now: ${status}.`,
    }),
};
