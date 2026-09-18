import { describe, expect, it } from "vitest";
import { renderWelcomeEmailHtml, WELCOME_EMAIL_HTML_TEMPLATE_RAW } from "./notifications.js";

/**
 * 18 Sept 2026 — guards against the exact mistakes the uploaded welcome
 * template shipped with (wrong currency name, wrong/stale per-coin
 * pricing) ever silently creeping back in, given this template is about
 * to go out to every existing user as a one-time send.
 */
describe("renderWelcomeEmailHtml", () => {
  it("substitutes {{FirstName}} with the recipient's first name only", () => {
    const html = renderWelcomeEmailHtml("Steven Gardner");
    expect(html).toContain("Welcome to Flipsta, Steven 👋");
    expect(html).not.toContain("{{FirstName}}");
  });

  it("falls back to 'there' when no display name is available", () => {
    expect(renderWelcomeEmailHtml("")).toContain("Welcome to Flipsta, there 👋");
  });

  it("uses the real Flippy Coin currency name, not the uploaded draft's 'Gold Coin'", () => {
    expect(WELCOME_EMAIL_HTML_TEMPLATE_RAW).toContain("Flippy Coin");
    expect(WELCOME_EMAIL_HTML_TEMPLATE_RAW).not.toContain("Gold Coin");
  });

  it("matches the real /coins per-tier pricing, not the uploaded draft's numbers", () => {
    expect(WELCOME_EMAIL_HTML_TEMPLATE_RAW).toContain("<td>Standard</td><td>£0.75</td>");
    expect(WELCOME_EMAIL_HTML_TEMPLATE_RAW).toContain("<td>Pro</td><td>£0.58</td>");
    expect(WELCOME_EMAIL_HTML_TEMPLATE_RAW).toContain("<td>Platinum</td><td>£0.45</td>");
    expect(WELCOME_EMAIL_HTML_TEMPLATE_RAW).toContain("<td>Non-Member</td><td>£1.00</td>");
    // "Elite" was the tier's old name (planning/coin-economy-proposal.md
    // renamed it to "Platinum") — the uploaded draft still said "Elite".
    expect(WELCOME_EMAIL_HTML_TEMPLATE_RAW).not.toContain(">Elite<");
  });

  it("flags subscriber pricing as not live yet, matching /coins' own disclaimer", () => {
    expect(WELCOME_EMAIL_HTML_TEMPLATE_RAW.toLowerCase()).toContain("coming soon");
  });

  it("hosts the mascot image rather than inlining it as a large base64 data URI", () => {
    expect(WELCOME_EMAIL_HTML_TEMPLATE_RAW).toContain("https://flipsta.co.uk/email/flippy-welcome-mascot.jpg");
    expect(WELCOME_EMAIL_HTML_TEMPLATE_RAW).not.toContain("data:image");
  });
});
