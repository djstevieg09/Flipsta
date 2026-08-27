import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/buy-requests/[id] — a shopper cancelling their own "Flipsta
 * It!" request. Uses the service-role client (migration 0020 deliberately
 * grants the owner no RLS update/delete policy) with the ownership and
 * status checks done here in application code instead — only lets someone
 * cancel their OWN request, and only before it's already been searched
 * (once an admin's spent AI budget searching it, the outcome stands; a
 * 'found' or 'not_found' request just sits there as a record, same as any
 * other completed request).
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  const { data: existing, error: fetchError } = await supabase.from("buy_requests").select("requester_id, status").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (existing.requester_id !== auth.userId) return NextResponse.json({ error: "Not your request." }, { status: 403 });
  if (!["pending_approval", "approved"].includes(existing.status)) {
    return NextResponse.json({ error: `Can't cancel a request that's already ${existing.status}.` }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("buy_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ request: data });
}
