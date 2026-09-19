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

export async function sendNotificationEmail(params: { to: string; subject: string; body: string; html?: string }) {
  if (!isEmailConfigured()) {
    console.log("[notifications] (stub — set RESEND_API_KEY to send for real)", {
      to: params.to,
      subject: params.subject,
    });
    return { id: `email_stub_${crypto.randomUUID()}`, stub: true };
  }

  // 18 Sept 2026 — html is optional so every existing plain-text call site
  // (ticketUpdated, buybackClaimStatus, dealMatch) keeps working unchanged;
  // Resend accepts text and html together in the same request and uses html
  // for clients that render it, falling back to text otherwise.
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress,
      to: params.to,
      subject: params.subject,
      text: params.body,
      ...(params.html ? { html: params.html } : {}),
    }),
  });
  if (!res.ok) {
    console.error("[notifications] Resend call failed:", res.status, await res.text());
  }
  return res.json();
}

/**
 * 18 Sept 2026, Steven: "please use this as the template for the welcome
 * email then send out the email to all users on the site like before" —
 * the HTML welcome template he supplied, corrected against the real coin
 * economy before going out to anyone: the uploaded draft called the
 * currency "Gold Coin" (it's "Flippy Coin" everywhere else in the product)
 * and its per-coin tiers didn't quite match what /coins actually shows
 * (Standard 75p, Pro 58p, "Platinum" — the tier formerly called "Elite" —
 * 45p, non-member £1.00, per packages/shared/src/constants.ts'
 * COIN_BUNDLES/SubscriptionTier and planning/coin-economy-proposal.md).
 * That subscriber pricing isn't switched on yet either (still "coming
 * soon" on /coins), so this template says so rather than promising a
 * discount nobody is actually getting charged.
 *
 * The mascot image ships as a real static asset
 * (apps/web/public/email/flippy-welcome-mascot.jpg) rather than the
 * ~254KB base64 data URI the upload had inlined — Gmail clips any message
 * over ~102KB ("[Message clipped] View entire message"), which a data URI
 * that size would trigger on almost every send.
 *
 * {{FirstName}} is a placeholder substituted by renderWelcomeEmailHtml
 * below — kept as a token (rather than a JS template literal directly)
 * so the SAME template string can also be stored as one promo_broadcasts
 * row's html_body (migration 0038) for the one-time "send to everyone"
 * blast, where sendPromoBroadcasts.ts substitutes it per recipient.
 */
const WELCOME_EMAIL_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Welcome to Flipsta</title>
<style>
body{margin:0;background:#0b0b0b;font-family:Arial,sans-serif;color:#fff;}
.container{max-width:700px;margin:auto;background:#111;}
.hero{background:linear-gradient(135deg,#111,#1a1a1a);padding:40px;text-align:center;}
.logo{font-size:48px;font-weight:bold;color:#f5b400;}
.tag{font-size:22px;color:#fff;margin-top:10px;}
.mascot{width:280px;border-radius:20px;margin:20px auto;display:block;}
.content{padding:35px;background:#fff;color:#222;}
.gold{color:#f5b400;font-weight:bold;}
.card{background:#f7f7f7;border-left:5px solid #f5b400;padding:15px;border-radius:8px;margin:15px 0;}
table{width:100%;border-collapse:collapse;margin-top:15px;}
th{background:#111;color:#f5b400;padding:12px;}
td{padding:12px;border:1px solid #ddd;text-align:center;}
.btn{display:inline-block;background:#f5b400;color:#111;padding:14px 28px;
font-weight:bold;text-decoration:none;border-radius:10px;margin-top:20px;}
.footer{background:#111;padding:25px;text-align:center;color:#aaa;}
.note{font-size:11px;color:#888;margin-top:8px;}
</style>
</head>
<body>
<div class="container">

<div class="hero">
<div class="logo">FLIPSTA</div>
<div class="tag">Find It. Flip It. Profit.</div>
<img class="mascot" src="https://flipsta.co.uk/email/flippy-welcome-mascot.jpg" width="280" alt="Flippy the Flipsta mascot">
</div>

<div class="content">
<h2>Welcome to Flipsta, {{FirstName}} 👋</h2>

<p>You've joined a marketplace built to help you discover opportunities, buy smarter and maximise profit.</p>

<div class="card">
<strong>Meet Flippy 🪙</strong><br>
Your official Flipsta guide. Look out for tips, promotions, competitions and exclusive member opportunities.
</div>

<h3>✅ Your Account Is Ready</h3>
<ul>
<li>Browse opportunities</li>
<li>Access the marketplace</li>
<li>Purchase Flippy Coins</li>
<li>Unlock member benefits</li>
<li>Track your activity</li>
</ul>

<h3>🪙 Flippy Coin Pricing</h3>
<table>
<tr><th>Membership</th><th>Price Per Coin</th></tr>
<tr><td>Standard</td><td>£0.75</td></tr>
<tr><td>Pro</td><td>£0.58</td></tr>
<tr><td>Platinum</td><td>£0.45</td></tr>
<tr><td>Non-Member</td><td>£1.00</td></tr>
</table>
<div class="note">Subscriber pricing is coming soon — for now every purchase is charged the Non-Member rate shown above.</div>

<h3>🚀 Getting Started</h3>
<ol>
<li>Complete your profile</li>
<li>Explore opportunities</li>
<li>Build your Flippy Coin balance</li>
<li>Start flipping</li>
</ol>

<div class="card">
<strong>Message from Flippy:</strong><br>
"The best opportunities don't stay around forever. Get in early, move fast and start flipping."
</div>

<center>
<a class="btn" href="https://flipsta.co.uk">ENTER FLIPSTA</a>
</center>

</div>

<div class="footer">
<strong>FLIPSTA</strong><br>
Find It. Flip It. Profit.
</div>

</div>
</body>
</html>`;

export function renderWelcomeEmailHtml(displayName: string): string {
  const firstName = (displayName || "there").trim().split(/\s+/)[0] || "there";
  return WELCOME_EMAIL_HTML_TEMPLATE.split("{{FirstName}}").join(firstName);
}

/**
 * 19 Sept 2026, Steven: "using the branding like the welcome email we need
 * to have an email when people upgrade to the next tier explaining the
 * benefits and coin price etc, i will leave that up to you." Same
 * hero/mascot/gold-card look as WELCOME_EMAIL_HTML_TEMPLATE above — sent
 * once a self-serve upgrade's Stripe Checkout actually completes (see
 * api/webhooks/stripe/route.ts's checkout.session.completed handler for
 * metadata.kind === "tier_upgrade"), never speculatively before payment
 * clears.
 *
 * Content is a hand-kept duplicate of app/upgrade/page.tsx's TIERS array
 * (display name, price, monthly coin allowance, headline perks) — that
 * page is the source of truth since it's what the customer actually saw
 * and bought, same "small human-verified duplicate, kept in sync by hand"
 * pattern the welcome email's own coin-pricing table above already uses.
 * Update both together if a tier's price or perks change.
 */
const TIER_EMAIL_CONTENT: Record<
  "standard" | "pro" | "elite",
  { displayName: string; priceLabel: string; coins: number; headlinePerks: string[] }
> = {
  standard: {
    displayName: "Silver",
    priceLabel: "£15/month",
    coins: 20,
    headlinePerks: [
      "Full bidding on the live opportunity feed",
      "One sector follow",
      "Basic portfolio dashboard — profit/loss, win rate, streak",
    ],
  },
  pro: {
    displayName: "Gold",
    priceLabel: "£45/month",
    coins: 77,
    headlinePerks: [
      "15-minute early access on new opportunities, ahead of Bronze & Silver",
      "Unlimited sector follows",
      "AI “why” explainability on every opportunity",
      "Sniper mode — automatic bidding within your own rules",
      "One-click multi-platform listing (eBay/Depop/Etsy/Whatnot/StockX)",
    ],
  },
  elite: {
    displayName: "Platinum",
    priceLabel: "£90/month",
    coins: 200,
    headlinePerks: [
      "Another 15-minute early access ahead of Gold — first to see every new opportunity",
      "Syndicate leadership — pool capital with other users on bigger opportunities",
      "Highest sniper budget limits, with priority processing",
      "Priority human support & dedicated account analytics",
    ],
  },
};

function renderTierUpgradeEmailHtml(displayName: string, tier: "standard" | "pro" | "elite"): string {
  const firstName = (displayName || "there").trim().split(/\s+/)[0] || "there";
  const t = TIER_EMAIL_CONTENT[tier];
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>You're on ${t.displayName} now</title>
<style>
body{margin:0;background:#0b0b0b;font-family:Arial,sans-serif;color:#fff;}
.container{max-width:700px;margin:auto;background:#111;}
.hero{background:linear-gradient(135deg,#111,#1a1a1a);padding:40px;text-align:center;}
.logo{font-size:48px;font-weight:bold;color:#f5b400;}
.tag{font-size:22px;color:#fff;margin-top:10px;}
.mascot{width:280px;border-radius:20px;margin:20px auto;display:block;}
.content{padding:35px;background:#fff;color:#222;}
.gold{color:#f5b400;font-weight:bold;}
.card{background:#f7f7f7;border-left:5px solid #f5b400;padding:15px;border-radius:8px;margin:15px 0;}
.btn{display:inline-block;background:#f5b400;color:#111;padding:14px 28px;
font-weight:bold;text-decoration:none;border-radius:10px;margin-top:20px;}
.footer{background:#111;padding:25px;text-align:center;color:#aaa;}
li{margin:6px 0;}
</style>
</head>
<body>
<div class="container">

<div class="hero">
<div class="logo">FLIPSTA</div>
<div class="tag">Find It. Flip It. Profit.</div>
<img class="mascot" src="https://flipsta.co.uk/email/flippy-welcome-mascot.jpg" width="280" alt="Flippy the Flipsta mascot">
</div>

<div class="content">
<h2>You're on <span class="gold">${t.displayName}</span> now, ${firstName} 🎉</h2>

<p>Your upgrade just went through — thanks for backing Flipsta. Here's exactly what ${t.displayName} gets you.</p>

<div class="card">
<strong>🪙 ${t.coins} Flippy Coins every month</strong><br>
Credited automatically to your Wallet each billing cycle, on top of anything you top up yourself — spend them on live opportunities the moment they land.
</div>

<h3>What's included on ${t.displayName}</h3>
<ul>
${t.headlinePerks.map((p) => `<li>${p}</li>`).join("\n")}
</ul>

<p>Your plan renews at <strong>${t.priceLabel}</strong>. Manage or change your plan any time from the Plans &amp; Pricing page.</p>

<center>
<a class="btn" href="https://flipsta.co.uk/opportunities">SEE WHAT'S LIVE</a>
</center>

</div>

<div class="footer">
<strong>FLIPSTA</strong><br>
Find It. Flip It. Profit.
</div>

</div>
</body>
</html>`;
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
  /**
   * 18 Sept 2026, Steven: "i need to setup resend so it can send emails for
   * sign ups." Sent once per new signup by apps/worker/src/jobs/
   * sendWelcomeEmails.ts (welcome_email_sent_at on profiles is the
   * idempotency marker — see migration 0037). Deliberately separate from
   * Supabase Auth's own "confirm your email" message, which is about
   * proving the address works, not about welcoming anyone.
   */
  welcome: (to: string, displayName: string) =>
    sendNotificationEmail({
      to,
      subject: "Welcome to Flipsta 🎉",
      body: [
        `Hey ${displayName},`,
        "",
        "You're in — welcome to Flipsta. Sell first, source after: no inventory, no risk.",
        "",
        "A few things worth doing next:",
        "- Set your sizes on your Account page so we can match you to deals",
        "- Add anything you're after to your wishlist",
        "- Invite a friend for Flippy Coins",
        "",
        "See you on flipsta.co.uk.",
        "",
        "Don't want marketing emails from us? You can turn those off any time from your Account page — this welcome email is a one-off either way.",
      ].join("\n"),
      html: renderWelcomeEmailHtml(displayName),
    }),
  /**
   * 19 Sept 2026, Steven: "we need to have an email when people upgrade to
   * the next tier explaining the benefits and coin price." Sent from
   * api/webhooks/stripe/route.ts once Stripe confirms a tier-upgrade
   * Checkout actually completed — never before payment clears.
   */
  tierUpgrade: (to: string, displayName: string, tier: "standard" | "pro" | "elite") => {
    const t = TIER_EMAIL_CONTENT[tier];
    return sendNotificationEmail({
      to,
      subject: `You're on ${t.displayName} now 🎉`,
      body: [
        `Hey ${(displayName || "there").trim().split(/\s+/)[0] || "there"},`,
        "",
        `Your upgrade to ${t.displayName} just went through — thanks for backing Flipsta.`,
        "",
        `${t.coins} Flippy Coins land in your Wallet every billing cycle from now on, on top of anything you top up yourself.`,
        "",
        `Also included on ${t.displayName}:`,
        ...t.headlinePerks.map((p) => `- ${p}`),
        "",
        `Renews at ${t.priceLabel}. Manage or change your plan any time from the Plans & Pricing page.`,
        "",
        "See what's live: flipsta.co.uk/opportunities",
      ].join("\n"),
      html: renderTierUpgradeEmailHtml(displayName, tier),
    });
  },
};

/**
 * The raw welcome template with its {{FirstName}} placeholder left intact
 * — used to seed the one-time "send the new template to every existing
 * user" broadcast (a promo_broadcasts row with audience 'all'), where
 * sendPromoBroadcasts.ts substitutes the placeholder per recipient rather
 * than baking one name into a single shared html_body value.
 */
export const WELCOME_EMAIL_HTML_TEMPLATE_RAW = WELCOME_EMAIL_HTML_TEMPLATE;

/**
 * 18 Sept 2026, Steven: "...and promo stuff." Unlike the templated events
 * above, an admin-composed broadcast's subject/body IS the content — this
 * just appends the same opt-out footer every other marketing-flavoured
 * email in this file carries, so staff writing a broadcast from
 * /admin/broadcasts don't have to remember to add it themselves. Sent by
 * apps/worker/src/jobs/sendPromoBroadcasts.ts, never from the API route
 * that creates the promo_broadcasts row (see migration 0037's comment for
 * why: sending a whole user base synchronously from a web request risks a
 * timeout).
 */
export function sendPromoBroadcastEmail(to: string, subject: string, body: string, html?: string) {
  const htmlFooter =
    '<p style="font-size:11px;color:#888;text-align:center;padding:12px;">Don\'t want promo emails from Flipsta? Turn them off any time from your Account page.</p>';
  // Insert just before </body> so the footer lands inside the document
  // rather than after a closing </html> tag; any html without a </body>
  // (a bare fragment) just gets it appended.
  const htmlWithFooter = html
    ? html.includes("</body>")
      ? html.replace("</body>", `${htmlFooter}</body>`)
      : `${html}${htmlFooter}`
    : undefined;
  return sendNotificationEmail({
    to,
    subject,
    body: `${body}\n\n---\nDon't want promo emails from Flipsta? Turn them off any time from your Account page.`,
    html: htmlWithFooter,
  });
}
