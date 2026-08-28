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
 * eBay's and Etsy's endpoints below are real, stable, publicly documented
 * URLs (verified against developer.ebay.com and developers.etsy.com — Etsy
 * Open API v3's authorize endpoint is https://www.etsy.com/oauth/connect,
 * token endpoint https://api.etsy.com/v3/public/oauth/token). Depop,
 * Whatnot, and StockX don't have a fixed public authorize URL to hardcode —
 * all three are gated behind a direct application to that platform's own
 * developer/partner team rather than self-serve, and each one issues
 * account-specific endpoint URLs as part of that approval, not published
 * ahead of time — so all three are left fully env-configurable
 * (CHANNEL_<X>_AUTHORIZE_URL / _TOKEN_URL) rather than guessed at here. See
 * INFRASTRUCTURE_TODO.md #9 for exactly how to get access to each.
 *
 * 27 Aug 2026: this file previously still had Amazon/Vinted/Facebook
 * Marketplace here instead of Etsy/Whatnot/StockX — a real drift from
 * salesChannels.ts (which is the source of truth for SalesChannelKey, so
 * this Record must always have exactly one entry per key there) caught
 * while walking Steven through the Etsy signup he'd asked for. See
 * salesChannels.ts's matching comment for the full story.
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
  etsy: {
    displayName: "Etsy",
    defaultAuthorizeUrl: "https://www.etsy.com/oauth/connect",
    defaultTokenUrl: "https://api.etsy.com/v3/public/oauth/token",
    scopes: ["listings_r", "listings_w"],
    // Etsy Open API v3 is a PKCE-only public-client flow — there is no
    // client secret at all, not even an optional one (confirmed against
    // developers.etsy.com/documentation/essentials/authentication). Only
    // CHANNEL_ETSY_CLIENT_ID needs setting; CLIENT_SECRET is simply never
    // sent, whatever's in env for it.
    usesPkce: true,
    requiresClientSecret: false,
    clientAuthMethod: "body",
    accessNote:
      "Self-serve — register a Personal App (not a Seller App — a Seller App only ever authorizes the single shop that created it, and Flipsta needs each of its own sellers to connect their own separate shop) at developers.etsy.com, then apply for Commercial Access on that same app before other sellers can connect (Etsy reviews this manually; timing varies). Set CHANNEL_ETSY_CLIENT_ID only.",
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
  whatnot: {
    displayName: "Whatnot",
    defaultAuthorizeUrl: null,
    defaultTokenUrl: null,
    scopes: [],
    usesPkce: false,
    requiresClientSecret: true,
    clientAuthMethod: "body",
    accessNote:
      "Gated — contact Whatnot's developer team to register a client app and redirect URI; they issue the client_id/secret and your specific authorize/token URLs. Set CHANNEL_WHATNOT_CLIENT_ID/_SECRET/_AUTHORIZE_URL/_TOKEN_URL.",
  },
  stockx: {
    displayName: "StockX",
    defaultAuthorizeUrl: null,
    defaultTokenUrl: null,
    scopes: [],
    usesPkce: false,
    requiresClientSecret: true,
    clientAuthMethod: "body",
    accessNote:
      "Gated, application/review process via the StockX Developer Portal — their OAuth pages also sit behind PerimeterX bot-detection, budget extra lead time. Once approved, set CHANNEL_STOCKX_CLIENT_ID/_SECRET/_AUTHORIZE_URL/_TOKEN_URL from StockX's own dashboard.",
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
