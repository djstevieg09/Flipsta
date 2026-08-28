import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { LIVE_SHOW_ITEM_AUCTION_SECONDS } from "@flipsta/shared";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/live-shows/:id/items/:itemId — host-only. action "activate"
 * starts this item's live auction clock (upcoming -> active); action
 * "skip" marks it unsold without ever activating it (host changed their
 * mind about showing it). Settlement of an ACTIVE item's clock running out
 * is the worker's job (closeExpiredLiveItems.ts), same division of
 * responsibility as opportunities' bid route vs. closeExpiredAuctions.ts.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();

  const { data: show, error: showError } = await supabase.from("live_shows").select("id, host_id, status").eq("id", id).single();
  if (showError || !show) return NextResponse.json({ error: "Show not found." }, { status: 404 });
  if (show.host_id !== auth.userId) return NextResponse.json({ error: "Only the host can manage this show's items." }, { status: 403 });

  const { data: item, error: itemError } = await supabase
    .from("live_show_items")
    .select("id, live_show_id, status")
    .eq("id", itemId)
    .eq("live_show_id", id)
    .single();
  if (itemError || !item) return NextResponse.json({ error: "Item not found on this show." }, { status: 404 });

  const { action } = await req.json();

  if (action === "activate") {
    if (show.status !== "live") return NextResponse.json({ error: "The show has to be live to activate an item." }, { status: 409 });
    if (item.status !== "upcoming") return NextResponse.json({ error: "This item has already been shown." }, { status: 409 });
    const nowIso = new Date().toISOString();
    const endsIso = new Date(Date.now() + LIVE_SHOW_ITEM_AUCTION_SECONDS * 1000).toISOString();
    const { data, error } = await supabase
      .from("live_show_items")
      .update({ status: "active", started_at: nowIso, ends_at: endsIso })
      .eq("id", itemId)
      .eq("status", "upcoming")
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  if (action === "skip") {
    if (item.status !== "upcoming") return NextResponse.json({ error: "Only an item that hasn't been shown yet can be skipped." }, { status: 409 });
    const { data, error } = await supabase
      .from("live_show_items")
      .update({ status: "unsold" })
      .eq("id", itemId)
      .eq("status", "upcoming")
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  return NextResponse.json({ error: "Unknown action — use 'activate' or 'skip'." }, { status: 400 });
}
