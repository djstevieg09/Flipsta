import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";
import { isValidSalesChannel } from "@flipsta/shared";
import { buildChannelAuthorizeUrl, generateOAuthState, generatePkcePair, getChannelOAuthConfig, isChannelConnectConfigured } from "@/lib/channelOAuth";

/**
 * GET /api/channel-connections/[channel]/connect — Section 7, made real:
 * the seller clicks "Connect eBay" on /settings/connections, lands here,
 * and is immediately redirected to eBay's own login/consent page. Nothing
 * about eBay/Depop/Etsy/Whatnot/StockX's actual login happens on Flipsta —
 * this route only ever builds the redirect and remembers a short-lived,
 * signed-nothing (just random) state value in an httpOnly cookie so the
 * callback can confirm this exact browser started the flow (CSRF
 * protection) and, for PKCE channels, the code_verifier to complete the
 * exchange with.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  if (!isValidSalesChannel(channel)) {
    return NextResponse.json({ error: "Unknown channel." }, { status: 404 });
  }

  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!TIER_ENTITLEMENTS[auth.profile.subscriptionTier].multiPlatformListing) {
    return NextResponse.json({ error: "Multi-platform listing requires Pro or Elite." }, { status: 403 });
  }

  if (!isChannelConnectConfigured(channel)) {
    const cfg = getChannelOAuthConfig(channel);
    return NextResponse.json(
      { error: `${cfg.displayName} isn't connectable yet. ${cfg.accessNote}` },
      { status: 503 },
    );
  }

  const state = generateOAuthState();
  const cfg = getChannelOAuthConfig(channel);
  const pkce = cfg.usesPkce ? generatePkcePair() : null;
  const redirectUri = `${req.nextUrl.origin}/api/channel-connections/${channel}/callback`;

  const authorizeUrl = buildChannelAuthorizeUrl(channel, {
    redirectUri,
    state,
    codeChallenge: pkce?.codeChallenge,
  });

  const res = NextResponse.redirect(authorizeUrl);
  // 10 minutes is generous for a seller to log into another site and grant
  // access; httpOnly + secure so nothing but this server can read it back.
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  res.cookies.set(`channel_oauth_state_${channel}`, state, cookieOpts);
  if (pkce) res.cookies.set(`channel_oauth_verifier_${channel}`, pkce.codeVerifier, cookieOpts);
  return res;
}
