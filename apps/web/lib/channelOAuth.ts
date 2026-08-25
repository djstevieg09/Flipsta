import { randomBytes, createHash } from "crypto";
import { SalesChannelKey } from "@flipsta/shared";

/**
 * Section 7 — the seller-side of multi-platform listing, made real: a
 * seller clicks "Connect eBay", signs into their own eBay account on
 * eBay's own site, grants access, and is redirected back connected. No API
 * key or password ever passes through Flipsta or through the seller.
 *
 * This is the OAuth 2.0 "Authorization Code" flow, standard across every
 * channel on the priority list. Each channel needs Flipsta registered as a
 * developer/app on that platform first (Steven's side, one-time — see
 * INFRASTRUCTURE_TODO.md's cross-posting section) before any seller can
 * connect an account there; until then this reports "not connectable yet"
 * with a clear reason instead of a broken button.
 *
 * eBay's endpoints below are real, stable, publicly documented URLs
 * (verified against developer.ebay.com). The other four channels on this
 * list (Amazon, Vinted, Facebook Marketplace, Depop) don't have a fixed
 * public authorize URL to hardcode, for three different reasons — so all
 * four are left fully env-configurable (CHANNEL_<X>_AUTHORIZE_URL /
 * _TOKEN_URL) rather than guessed at here:
 *   - Amazon (Selling Partner API): the flow is real and self-serve, but
 *     the authorize URL is specific to Flipsta's own registered
 *     application (issued once Steven registers as an SP-API developer
 *     via the Selling Partner Appstore) — there's no single fixed URL to
 *     hardcode ahead of that.
 *   - Vinted: has no public seller/listing API at all as of writing —
 *     this will stay "not connectable" until that changes.
 *   - Facebook Marketplace: Meta's Graph API deliberately excludes
 *     Marketplace (Pages, Groups, Ads, Instagram are covered; Marketplace
 *     is not) — there's no official way to list on a seller's behalf, so
 *     this will also stay "not connectable" barring a Meta API change.
 *   - Depop: gated behind a direct Partner API application, not
 *     self-serve.
 */
interface ChannelOAuthStatic {
  displayName: string;
  defaultAuthorizeUrl: string | null;
  defaultTokenUrl: string | null;
  scopes: string[];
  /** PKCE (RFC 7636) — required by Etsy and Depop; not used by eBay. */
  usesPkce: boolean;
  /** Whether the token exchange sends a client secret at all (Etsy's PKCE-only public-client flow doesn't). */
  requiresClientSecret: boolean;
  /** How the client credentials are sent on the token request. */
  clientAuthMethod: "basic" | "body";
  accessNote: string;
}

const CHANNEL_OAUTH_STATIC: Record<SalesChannelKey, ChannelOAuthStatic> = {
  ebay: {
    displayName: "eBay",
    defaultAuthorizeUrl: "https://auth.ebay.com/oauth2/authorize",
    defaultTokenUrl: "https://api.ebay.com/identity/v1/oauth2/token",
    scopes: ["https://api.ebay.com/oauth/api_scope/sell.inventory"],
    usesPkce: false,
    requiresClientSecret: true,
    clientAuthMethod: "basic",
    accessNote: "Public, self-serve — register an OAuth application at the eBay Developers Program (developer.ebay.com).",
  },
  depop: {
    displayName: "Depop",
    defaultAuthorizeUrl: null,
    defaultTokenUrl: null,
    scopes: ["products_read", "products_write"],
    usesPkce: true,
    requiresClientSecret: true,
    clientAuthMethod: "body",
    accessNote:
      "Gated — Depop's Partner API isn't self-serve; email their Partner API team to get a client_id/secret and your specific authorize/token URLs, then set CHANNEL_DEPOP_CLIENT_ID/_SECRET/_AUTHORIZE_URL/_TOKEN_URL.",
  },
  amazon: {
    displayName: "Amazon",
    defaultAuthorizeUrl: null,
    defaultTokenUrl: null,
    scopes: [],
    usesPkce: false,
    requiresClientSecret: true,
    clientAuthMethod: "body",
    accessNote:
      "Real and self-serve via the Selling Partner API (Login with Amazon), but there's no single fixed authorize URL — it's issued once Flipsta is registered as an SP-API developer app via the Selling Partner Appstore, and a seller also needs their own existing Seller Central account. Once registered, set CHANNEL_AMAZON_CLIENT_ID/_SECRET/_AUTHORIZE_URL/_TOKEN_URL from Amazon's app dashboard.",
  },
  vinted: {
    displayName: "Vinted",
    defaultAuthorizeUrl: null,
    defaultTokenUrl: null,
    scopes: [],
    usesPkce: false,
    requiresClientSecret: true,
    clientAuthMethod: "body",
    accessNote:
      "Not connectable — Vinted has no public seller or listing API to build against. Revisit if that changes; until then this channel will always show as not configured.",
  },
  facebook_marketplace: {
    displayName: "Facebook Marketplace",
    defaultAuthorizeUrl: null,
    defaultTokenUrl: null,
    scopes: [],
    usesPkce: false,
    requiresClientSecret: true,
    clientAuthMethod: "body",
    accessNote:
      "Not connectable — Meta's Graph API deliberately excludes Marketplace (Pages, Groups, Ads and Instagram are covered; Marketplace listings are not), so there's no official way to post a listing on a seller's behalf. Revisit if Meta ever opens this up.",
  },
};

function envKey(channel: SalesChannelKey, suffix: string): string {
  return `CHANNEL_${channel.toUpperCase()}_${suffix}`;
}

export interface ChannelOAuthConfig extends ChannelOAuthStatic {
  channel: SalesChannelKey;
  clientId?: string;
  clientSecret?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
}

export function getChannelOAuthConfig(channel: SalesChannelKey): ChannelOAuthConfig {
  const base = CHANNEL_OAUTH_STATIC[channel];
  return {
    channel,
    ...base,
    clientId: process.env[envKey(channel, "CLIENT_ID")] || undefined,
    clientSecret: process.env[envKey(channel, "CLIENT_SECRET")] || undefined,
    authorizeUrl: process.env[envKey(channel, "AUTHORIZE_URL")] || base.defaultAuthorizeUrl || undefined,
    tokenUrl: process.env[envKey(channel, "TOKEN_URL")] || base.defaultTokenUrl || undefined,
  };
}

/** Whether a seller could actually see a working "Connect" button for this channel right now. */
export function isChannelConnectConfigured(channel: SalesChannelKey): boolean {
  const c = getChannelOAuthConfig(channel);
  const hasSecret = !c.requiresClientSecret || Boolean(c.clientSecret);
  return Boolean(c.clientId && hasSecret && c.authorizeUrl && c.tokenUrl);
}

/** Builds the URL to send the seller's browser to for them to log in and grant access. */
export function buildChannelAuthorizeUrl(
  channel: SalesChannelKey,
  params: { redirectUri: string; state: string; codeChallenge?: string },
): string {
  const cfg = getChannelOAuthConfig(channel);
  if (!isChannelConnectConfigured(channel) || !cfg.authorizeUrl) {
    throw new Error(`${cfg.displayName} isn't connectable yet — ${cfg.accessNote}`);
  }
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", cfg.clientId!);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", params.state);
  if (cfg.scopes.length) url.searchParams.set("scope", cfg.scopes.join(" "));
  if (cfg.usesPkce && params.codeChallenge) {
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export interface ChannelTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  [key: string]: unknown;
}

/**
 * Exchanges the authorization code the platform sent back for an access
 * (and usually refresh) token. This is the generic OAuth 2.0 shape every
 * channel here documents; the one real per-platform variation known and
 * handled is eBay's Basic-auth client credentials (clientAuthMethod above)
 * vs. everyone else sending them in the request body. A gated platform
 * (Depop/Whatnot/StockX) may have its own further quirks not knowable until
 * Steven has real credentials to test against — worth a quick check against
 * that platform's docs the first time a real connection is attempted.
 */
export async function exchangeChannelCodeForToken(
  channel: SalesChannelKey,
  params: { code: string; redirectUri: string; codeVerifier?: string },
): Promise<ChannelTokenResponse> {
  const cfg = getChannelOAuthConfig(channel);
  if (!isChannelConnectConfigured(channel) || !cfg.tokenUrl) {
    throw new Error(`${cfg.displayName} isn't connectable yet — ${cfg.accessNote}`);
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
  });
  if (cfg.usesPkce && params.codeVerifier) body.set("code_verifier", params.codeVerifier);

  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (cfg.clientAuthMethod === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", cfg.clientId!);
    if (cfg.requiresClientSecret && cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, { method: "POST", headers, body: body.toString() });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${cfg.displayName} rejected the token exchange (HTTP ${res.status}). ${detail}`.trim());
  }
  return res.json();
}

/** A random, unguessable value to protect the OAuth round-trip from CSRF. */
export function generateOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

/** PKCE (RFC 7636) code_verifier / code_challenge pair — required by Etsy and Depop. */
export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}
