import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { SALES_CHANNELS, isValidSalesChannel } from "@flipsta/shared";
import { isChannelConnectConfigured } from "@/lib/channelOAuth";

// Force-dynamic: every route here reads live application data (bids, wallet
// balances, opportunities, order status) straight from Supabase. Without this,
// Next.js's App Router can cache a GET route's first response (including the
// fetch calls a library like supabase-js makes under the hood) and keep
// serving that same stale response indefinitely, even after the database
// changes underneath it — exactly what caused real, freshly-discovered
// opportunities to not show up on /opportunities on 25 Aug 2026.
export const dynamic = "force-dynamic";

/**
 * GET /api/channel-connections — the seller's own "Connected accounts"
 * status, one row per channel on the priority list, merging three things:
 * whether Flipsta itself is set up to connect to that channel yet
 * (`connectable`, driven by env vars — see channelOAuth.ts), and whether
 * this particular seller has actually gone through the OAuth flow
 * (`connected`, from channel_connections). Never returns access/refresh
 * tokens — those stay server-side only.
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("channel_connections")
    .select("channel, external_username, status, connected_at")
    .eq("profile_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byChannel = new Map<string, { channel: string; external_username: string | null; status: string; connected_at: string | null }>(
    (data ?? []).map((row: any) => [row.channel, row]),
  );

  const channels = SALES_CHANNELS.filter((c) => isValidSalesChannel(c.key)).map((c) => {
    const row = byChannel.get(c.key);
    return {
      channel: c.key,
      name: c.name,
      connectable: isChannelConnectConfigured(c.key),
      connected: row?.status === "connected",
      externalUsername: row?.external_username ?? null,
      connectedAt: row?.connected_at ?? null,
    };
  });

  return NextResponse.json({ channels });
}
