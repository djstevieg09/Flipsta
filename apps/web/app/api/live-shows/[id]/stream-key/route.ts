import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

export const dynamic = "force-dynamic";

/**
 * GET /api/live-shows/:id/stream-key — the host's own WHIP broadcast URL,
 * for /live/[id]/host to hand to the browser's WebRTC connection. Uses the
 * service-role client since live_show_stream_keys has zero RLS policies
 * (migration 0027) — auth.uid() === host_id is checked here, in
 * application code, instead.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = createSupabaseServiceClient();

  const { data: show, error: showError } = await supabase.from("live_shows").select("id, host_id, status").eq("id", id).single();
  if (showError || !show) return NextResponse.json({ error: "Show not found." }, { status: 404 });
  if (show.host_id !== auth.userId) return NextResponse.json({ error: "Only the host can see this show's broadcast key." }, { status: 403 });

  const { data: key, error: keyError } = await supabase
    .from("live_show_stream_keys")
    .select("cf_whip_url")
    .eq("live_show_id", id)
    .single();
  if (keyError || !key) return NextResponse.json({ error: "No broadcast key found for this show." }, { status: 404 });

  return NextResponse.json({ whipUrl: key.cf_whip_url });
}
