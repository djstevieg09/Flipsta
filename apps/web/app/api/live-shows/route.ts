import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { requireTier, TierGuardError } from "@/lib/tierGuard";
import { createLiveInput, isCloudflareStreamConfigured, playbackIframeUrl } from "@/lib/cloudflareStream";

// Force-dynamic — see the note on every other route reading live application data.
export const dynamic = "force-dynamic";

/**
 * GET /api/live-shows — the public /live browse page. Confirmed answer to
 * "who can host": "Any approved reseller" — so this is public/no-auth, same
 * as /shop and /opportunities' teaser view.
 */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("live_shows")
    .select("*, profiles!live_shows_host_id_fkey(display_name)")
    .order("scheduled_at", { ascending: true, nullsFirst: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const shows = (data ?? []).map((s: any) => ({
    ...s,
    hostDisplayName: s.profiles?.display_name ?? "Unknown seller",
    playbackUrl: s.cf_playback_uid ? playbackIframeUrl(s.cf_playback_uid) : null,
  }));

  return NextResponse.json({ shows });
}

/**
 * POST /api/live-shows — a reseller schedules a new show. Gated on
 * TIER_ENTITLEMENTS.canSell (Steven's "Any approved reseller" — same bar
 * as being able to list on the marketplace at all, not a separate,
 * higher tier requirement).
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  try {
    requireTier(auth.profile.subscriptionTier, "canSell");
  } catch (e) {
    if (e instanceof TierGuardError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  if (!isCloudflareStreamConfigured()) {
    return NextResponse.json(
      { error: "Live video isn't set up yet — check back soon, or ask Steven to finish the Cloudflare Stream setup (INFRASTRUCTURE_TODO.md)." },
      { status: 503 },
    );
  }

  const { title, description, scheduledAt, overlayTheme } = await req.json();
  if (!title || !String(title).trim()) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }
  const VALID_THEMES = ["classic", "bold", "minimal"];
  if (overlayTheme !== undefined && !VALID_THEMES.includes(overlayTheme)) {
    return NextResponse.json({ error: `overlayTheme must be one of: ${VALID_THEMES.join(", ")}.` }, { status: 400 });
  }

  // The Cloudflare Live Input is created up front, at scheduling time, not
  // when the host actually goes live — the host needs the WHIP broadcast
  // URL in advance so /live/[id]/host can be ready to connect the moment
  // they press "Go live".
  let liveInput;
  try {
    liveInput = await createLiveInput({ showTitle: String(title).trim() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't set up live video for this show." }, { status: 502 });
  }

  // Insert via the caller's own session (RLS: "hosts create their own
  // shows") — public columns only, so no reason to reach for the
  // service-role client here.
  const supabase = await createSupabaseServerClient();
  const { data: show, error: showError } = await supabase
    .from("live_shows")
    .insert({
      host_id: auth.userId,
      title: String(title).trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      scheduled_at: scheduledAt ?? null,
      cf_live_input_uid: liveInput.liveInputUid,
      cf_playback_uid: liveInput.playbackUid,
      overlay_theme: overlayTheme ?? "classic",
    })
    .select()
    .single();
  if (showError) return NextResponse.json({ error: showError.message }, { status: 500 });

  // The WHIP url is a broadcast credential — written via the service-role
  // client into the separate, no-policy-at-all live_show_stream_keys table
  // (see migration 0027's comments), never through the publicly-readable
  // live_shows row.
  const serviceSupabase = createSupabaseServiceClient();
  const { error: keyError } = await serviceSupabase
    .from("live_show_stream_keys")
    .insert({ live_show_id: show.id, cf_whip_url: liveInput.whipUrl });
  if (keyError) {
    // The show row exists but has no usable stream key — surface this
    // loudly rather than leaving a silently-broken show around.
    return NextResponse.json({ error: `Show created but the broadcast key failed to save: ${keyError.message}` }, { status: 500 });
  }

  return NextResponse.json({ show }, { status: 201 });
}
