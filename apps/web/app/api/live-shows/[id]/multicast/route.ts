import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createMulticastOutput } from "@/lib/cloudflareStream";

export const dynamic = "force-dynamic";

const VALID_PLATFORMS = ["youtube", "facebook", "instagram", "tiktok", "custom"];

/**
 * GET /api/live-shows/:id/multicast — host-only list of this show's
 * multicast destinations. The stream key is never returned once saved
 * (same write-only-secret convention as the WHIP url) — just enough to
 * show what's connected and let the host remove one.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  const { data: show, error: showError } = await supabase.from("live_shows").select("id, host_id").eq("id", id).single();
  if (showError || !show) return NextResponse.json({ error: "Show not found." }, { status: 404 });
  if (show.host_id !== auth.userId) return NextResponse.json({ error: "Only the host can see this." }, { status: 403 });

  const { data, error } = await supabase
    .from("live_show_multicast_targets")
    .select("id, platform, label, rtmp_url, created_at")
    .eq("live_show_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ targets: data });
}

/**
 * POST /api/live-shows/:id/multicast — host adds one destination. Calls
 * Cloudflare's real outputs API immediately (not deferred to when the
 * host actually broadcasts) so a bad URL/key is caught right away rather
 * than silently failing mid-show.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  const { data: show, error: showError } = await supabase
    .from("live_shows")
    .select("id, host_id, cf_live_input_uid, status")
    .eq("id", id)
    .single();
  if (showError || !show) return NextResponse.json({ error: "Show not found." }, { status: 404 });
  if (show.host_id !== auth.userId) return NextResponse.json({ error: "Only the host can manage this." }, { status: 403 });
  if (!show.cf_live_input_uid) return NextResponse.json({ error: "This show has no live video set up." }, { status: 409 });

  const { platform, label, rtmpUrl, streamKey } = await req.json();
  if (!VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: `platform must be one of: ${VALID_PLATFORMS.join(", ")}.` }, { status: 400 });
  }
  if (!rtmpUrl || !streamKey) {
    return NextResponse.json({ error: "rtmpUrl and streamKey are both required." }, { status: 400 });
  }

  let output;
  try {
    output = await createMulticastOutput({ liveInputUid: show.cf_live_input_uid, rtmpUrl, streamKey });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't add that destination." }, { status: 502 });
  }

  const { data: target, error: insertError } = await supabase
    .from("live_show_multicast_targets")
    .insert({
      live_show_id: id,
      platform,
      label: typeof label === "string" && label.trim() ? label.trim() : null,
      rtmp_url: rtmpUrl,
      stream_key: streamKey,
      cf_output_id: output.outputId,
    })
    .select("id, platform, label, rtmp_url, created_at")
    .single();
  if (insertError) {
    const message = insertError.message.includes("unique")
      ? "You've already added a destination for this platform on this show."
      : insertError.message;
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ target }, { status: 201 });
}
