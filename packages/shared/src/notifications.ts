/**
 * Section 12.5 — Notifications. Originally lived only in apps/web/lib
 * (email at minimum, from launch: auction win/outbid alerts, buyback claim
 * status changes, ticket updates, order status changes — see that file's
 * original history). Moved here 27 Aug 2026 so apps/worker can send real
 * email too, for the new deal-drop notifications job
 * (apps/worker/src/jobs/notifyDealMatches.ts) — a worker job can't import
 * from apps/web/lib, only from a shared package both apps already depend
 * on. apps/web/lib/notifications.ts now just re-exports this.
 *
 * Wraps Resend (a good fit for a Next.js app per the infrastructure
 * checklist) behind one function so call sites don't care which provider
 * is behind it. Needs RESEND_API_KEY set — see INFRASTRUCTURE_TODO.md.
 * Falls back to a clearly-labelled console stub when it's not set, same
 * pattern as apps/web/lib/stripe.ts, so every call site is exercisable
 * without a real email account configured.
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
  /**
   * 27 Aug 2026 — the missing "Trigger" stage of the Hook Model (see
   * claude/deployment-checklist.md's #-5 research): a real, freshly-landed
   * item that matches something the shopper actually saved or a size they
   * actually set, not a generic marketing blast. One email per run per
   * shopper listing everything new that matched (see notifyDealMatches.ts)
   * — never one email per item, which would just be spam.
   */
  dealMatch: (to: string, items: { productName: string; priceGBP: number; reason: string }[]) =>
    sendNotificationEmail({
      to,
      subject: items.length === 1 ? `New match: ${items[0].productName}` : `${items.length} new deals match what you're after`,
      body: items
        .map((i) => `${i.productName} — £${i.priceGBP.toFixed(2)} (${i.reason})`)
        .concat(["", "See it on flipsta.co.uk/shop", "", "Don't want these emails? Turn them off any time from your Account page."])
        .join("\n"),
    }),
};
