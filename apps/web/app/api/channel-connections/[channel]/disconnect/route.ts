import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isValidSalesChannel } from "@flipsta/shared";

/**
 * POST /api/channel-connections/[channel]/disconnect — a seller revoking
 * Flipsta's access on their end, mirrored here. This only removes
 * Flipsta's stored token; it doesn't itself call the platform to revoke
 * it — link out to that platform's own "connected apps" settings for a
 * true revoke, same as any other third-party app connection.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  if (!isValidSalesChannel(channel)) return NextResponse.json({ error: "Unknown channel." }, { status: 404 });

  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("channel_connections")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("profile_id", auth.userId)
    .eq("channel", channel);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
