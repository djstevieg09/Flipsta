import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/trending-signals/[id] — e.g. extend expiresOn if a trend's still running strong. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if ("keyword" in body) {
    if (!body.keyword || typeof body.keyword !== "string" || !body.keyword.trim()) {
      return NextResponse.json({ error: "keyword cannot be blank." }, { status: 400 });
    }
    update.keyword = body.keyword.trim();
  }
  if ("categorySlugs" in body) update.category_slugs = Array.isArray(body.categorySlugs) ? body.categorySlugs : [];
  if ("note" in body) update.note = body.note;
  if ("source" in body) update.source = body.source;
  if ("expiresOn" in body) update.expires_on = body.expiresOn;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No recognised fields to update." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from("trending_signals").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `trending signal updated: "${data.keyword}"`,
    targetType: "trending_signal",
    targetId: id,
  });

  return NextResponse.json({ signal: data });
}

/** DELETE /api/admin/trending-signals/[id] — remove a trend early (e.g. it's already fizzled out). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const { data: existing } = await supabase.from("trending_signals").select("keyword").eq("id", id).single();
  const { error } = await supabase.from("trending_signals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `trending signal deleted: "${existing?.keyword ?? id}"`,
    targetType: "trending_signal",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
