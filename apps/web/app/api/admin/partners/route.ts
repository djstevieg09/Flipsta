import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";
import { PARTNER_TYPES } from "@flipsta/shared";

/**
 * GET/POST /api/admin/partners — Section 12.2 supplier & courier partner
 * programme. One table, a `type` field distinguishes commission-charged
 * (supplier) from affiliate-code-tracked (courier) partners, as designed.
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from("partners").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partners: data });
}

export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { name, type, commissionOrCode, contactEmail } = await req.json();
  if (!name || !type) return NextResponse.json({ error: "name and type are required." }, { status: 400 });
  if (!PARTNER_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${PARTNER_TYPES.join(", ")}` }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("partners")
    .insert({ name, type, commission_or_code: commissionOrCode ?? null, contact_email: contactEmail ?? null, status: "pending" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, { adminId: auth.userId, action: "partner added (pending)", targetType: "partner", targetId: data.id });

  return NextResponse.json({ partner: data }, { status: 201 });
}
