import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { deleteMulticastOutput } from "@/lib/cloudflareStream";

export const dynamic = "force-dynamic";

/** DELETE /api/live-shows/:id/multicast/:targetId — host removes one destination. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; targetId: string }> }) {
  const { id, targetId } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  const { data: show, error: showError } = await supabase
    .from("live_shows")
    .select("id, host_id, cf_live_input_uid")
    .eq("id", id)
    .single();
  if (showError || !show) return NextResponse.json({ error: "Show not found." }, { status: 404 });
  if (show.host_id !== auth.userId) return NextResponse.json({ error: "Only the host can manage this." }, { status: 403 });

  const { data: target, error: targetError } = await supabase
    .from("live_show_multicast_targets")
    .select("id, cf_output_id")
    .eq("id", targetId)
    .eq("live_show_id", id)
    .single();
  if (targetError || !target) return NextResponse.json({ error: "Destination not found." }, { status: 404 });

  if (show.cf_live_input_uid && target.cf_output_id) {
    await deleteMulticastOutput(show.cf_live_input_uid, target.cf_output_id);
  }

  const { error: deleteError } = await supabase.from("live_show_multicast_targets").delete().eq("id", targetId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
