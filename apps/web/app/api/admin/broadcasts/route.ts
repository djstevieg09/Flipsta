import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/admin/broadcasts — 18 Sept 2026, Steven: "i need to setup
 * resend so it can send emails for sign ups and promo stuff." This is the
 * "promo stuff" half. Backed by migration 0037's promo_broadcasts table.
 * POST only ever inserts a 'pending' row — the actual send happens in
 * apps/worker/src/jobs/sendPromoBroadcasts.ts (see that file for why it's
 * not done synchronously here), so a fresh broadcast won't show as "sent"
 * until the worker's next tick (every 5 minutes — apps/worker/src/index.ts).
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("promo_broadcasts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    broadcasts: (data ?? []).map((b: any) => ({
      id: b.id,
      subject: b.subject,
      body: b.body,
      status: b.status,
      audience: b.audience,
      recipientCount: b.recipient_count,
      createdAt: b.created_at,
      sentAt: b.sent_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { subject, body, audience } = await req.json();
  if (!subject || typeof subject !== "string" || !subject.trim()) {
    return NextResponse.json({ error: "subject is required." }, { status: 400 });
  }
  if (!body || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "body is required." }, { status: 400 });
  }
  const resolvedAudience = audience === "all" ? "all" : "opted_in";

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("promo_broadcasts")
    .insert({
      subject: subject.trim(),
      body: body.trim(),
      audience: resolvedAudience,
      created_by: auth.userId,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `promo broadcast queued: "${subject.trim()}" (audience: ${resolvedAudience})`,
    targetType: "promo_broadcast",
    targetId: data.id,
  });

  return NextResponse.json({ broadcast: data }, { status: 201 });
}
