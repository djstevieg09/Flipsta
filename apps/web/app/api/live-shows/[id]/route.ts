import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { deleteLiveInput, playbackIframeUrl } from "@/lib/cloudflareStream";

export const dynamic = "force-dynamic";

/** GET /api/live-shows/:id — a single show's detail, for /live/[id]. Public, same as the list. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: show, error } = await supabase
    .from("live_shows")
    .select("*, profiles!live_shows_host_id_fkey(display_name)")
    .eq("id", id)
    .single();
  if (error || !show) return NextResponse.json({ error: "Show not found." }, { status: 404 });

  return NextResponse.json({
    show: {
      ...show,
      hostDisplayName: (show as any).profiles?.display_name ?? "Unknown seller",
      playbackUrl: show.cf_playback_uid ? playbackIframeUrl(show.cf_playback_uid) : null,
    },
  });
}

/**
 * PATCH /api/live-shows/:id — host-only actions: start (scheduled -> live),
 * end (live -> ended, cleans up the Cloudflare Live Input), cancel
 * (scheduled -> cancelled), or a plain title/description edit while still
 * scheduled. One route for all of it, action-shaped like
 * api/admin/sellers/[id] rather than a generic field PATCH, since each
 * transition has its own real side effects (timestamps, Cloudflare
 * cleanup) that don't belong as bare column writes.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: show, error: showError } = await supabase.from("live_shows").select("*").eq("id", id).single();
  if (showError || !show) return NextResponse.json({ error: "Show not found." }, { status: 404 });
  if (show.host_id !== auth.userId) return NextResponse.json({ error: "Only the host can manage this show." }, { status: 403 });

  const body = await req.json();
  const action = body.action as string | undefined;

  if (action === "start") {
    if (show.status !== "scheduled") return NextResponse.json({ error: "This show isn't scheduled — it can't be started." }, { status: 409 });
    const { data, error } = await supabase
      .from("live_shows")
      .update({ status: "live", started_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "scheduled")
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ show: data });
  }

  if (action === "end") {
    if (show.status !== "live") return NextResponse.json({ error: "This show isn't live." }, { status: 409 });
    const { data, error } = await supabase
      .from("live_shows")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "live")
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Best-effort — see deleteLiveInput's own comment. Any still-active
    // item on this show is left as-is; the worker's
    // closeExpiredLiveItems.ts sweep will settle it once its own clock runs
    // out, same as opportunities' auctions.
    if (show.cf_live_input_uid) await deleteLiveInput(show.cf_live_input_uid);
    return NextResponse.json({ show: data });
  }

  if (action === "cancel") {
    if (show.status !== "scheduled") return NextResponse.json({ error: "Only a not-yet-started show can be cancelled." }, { status: 409 });
    const { data, error } = await supabase
      .from("live_shows")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "scheduled")
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (show.cf_live_input_uid) await deleteLiveInput(show.cf_live_input_uid);
    return NextResponse.json({ show: data });
  }

  // Plain edit — only while still scheduled, so a live show's title can't
  // be swapped out mid-broadcast in a way that confuses viewers already watching.
  if (show.status !== "scheduled") {
    return NextResponse.json({ error: "This show can no longer be edited." }, { status: 409 });
  }
  const update: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
  if (typeof body.description === "string") update.description = body.description.trim() || null;
  if (body.scheduledAt !== undefined) update.scheduled_at = body.scheduledAt;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { data, error } = await supabase.from("live_shows").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ show: data });
}
