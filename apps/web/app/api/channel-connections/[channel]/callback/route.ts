import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isValidSalesChannel } from "@flipsta/shared";
import { exchangeChannelCodeForToken } from "@/lib/channelOAuth";

// Force-dynamic: every route here reads live application data (bids, wallet
// balances, opportunities, order status) straight from Supabase. Without this,
// Next.js's App Router can cache a GET route's first response (including the
// fetch calls a library like supabase-js makes under the hood) and keep
// serving that same stale response indefinitely, even after the database
// changes underneath it — exactly what caused real, freshly-discovered
// opportunities to not show up on /opportunities on 25 Aug 2026.
export const dynamic = "force-dynamic";

/**
 * GET /api/channel-connections/[channel]/callback — where eBay/Depop/Etsy/
 * Whatnot/StockX send the seller's browser back to after they log in and
 * grant access. This is the only place a token from one of these platforms
 * ever touches Flipsta, and it's written straight to the DB via the
 * service-role client — never sent back down to the browser.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const redirectTo = (status: "connected" | "error", message?: string) => {
    const url = new URL("/settings/connections", req.nextUrl.origin);
    url.searchParams.set("channel", channel);
    url.searchParams.set("status", status);
    if (message) url.searchParams.set("message", message);
    return NextResponse.redirect(url);
  };

  if (!isValidSalesChannel(channel)) return redirectTo("error", "Unknown channel.");

  const auth = await getCurrentProfile();
  if (!auth) return redirectTo("error", "You were signed out during the connection — please sign in and try again.");

  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) {
    return redirectTo("error", req.nextUrl.searchParams.get("error_description") ?? oauthError);
  }

  const code = req.nextUrl.searchParams.get("code");
  const returnedState = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(`channel_oauth_state_${channel}`)?.value;
  const codeVerifier = req.cookies.get(`channel_oauth_verifier_${channel}`)?.value;

  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return redirectTo("error", "The connection attempt couldn't be verified (state mismatch) — please try again.");
  }

  try {
    const redirectUri = `${req.nextUrl.origin}/api/channel-connections/${channel}/callback`;
    const token = await exchangeChannelCodeForToken(channel, { code, redirectUri, codeVerifier });

    const supabase = createSupabaseServiceClient();
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    const { error: dbError } = await supabase.from("channel_connections").upsert(
      {
        profile_id: auth.userId,
        channel,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        token_expires_at: expiresAt,
        status: "connected",
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,channel" },
    );
    if (dbError) return redirectTo("error", dbError.message);

    const res = redirectTo("connected");
    res.cookies.delete(`channel_oauth_state_${channel}`);
    res.cookies.delete(`channel_oauth_verifier_${channel}`);
    return res;
  } catch (err) {
    return redirectTo("error", (err as Error).message);
  }
}
