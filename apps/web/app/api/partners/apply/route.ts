import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { PARTNER_TYPES } from "@flipsta/shared";

/**
 * POST /api/partners/apply — Section 12.2's "easy way to sign up" for
 * suppliers and courier affiliates. Deliberately public/unauthenticated —
 * a courier or distributor applying isn't necessarily a Flipsta account
 * holder yet — so this goes straight through the service-role client
 * rather than needing an anon-insert RLS policy on `partners`. Everything
 * lands as `status: 'pending'`; nothing here is live until staff approve it
 * on /admin/partners (Section 12.1).
 */
export async function POST(req: NextRequest) {
  const { name, type, contactEmail, commissionOrCode, notes } = await req.json();

  if (!name || !type || !contactEmail) {
    return NextResponse.json({ error: "name, type, and contactEmail are required." }, { status: 400 });
  }
  if (!PARTNER_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${PARTNER_TYPES.join(", ")}` }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("partners")
    .insert({ name, type, contact_email: contactEmail, commission_or_code: commissionOrCode ?? null, notes: notes ?? null, status: "pending" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ partner: { id: data.id, status: data.status } }, { status: 201 });
}
