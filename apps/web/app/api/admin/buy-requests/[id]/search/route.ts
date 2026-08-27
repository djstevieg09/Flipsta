import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";
import { searchForBuyRequest } from "@/lib/buyRequestSearch";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/buy-requests/[id]/search — "admin click a button AI then
 * goes out and finds the deal that is under what the user is looking to
 * pay" (26 Aug 2026, Steven). Only runs on an 'approved' request — the
 * approval step is what stands between a shopper's free-text request and
 * real AI search spend. Single attempt: sets 'found' with the real match's
 * details, or 'not_found' if nothing genuine turned up. No retry loop and
 * no shopper notification here — Steven confirmed both are a later round
 * ("eventually this will send a message... but for now just add the
 * button and the UI"); for now the result just shows up next time the
 * shopper (or an admin) looks at the request.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const { data: existing, error: fetchError } = await supabase
    .from("buy_requests")
    .select("status, description, target_price_gbp")
    .eq("id", id)
    .single();
  if (fetchError || !existing) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (existing.status !== "approved") {
    return NextResponse.json({ error: `Only an approved request can be searched (this one is "${existing.status}").` }, { status: 409 });
  }

  // Marked 'searching' up front so a slow AI call (this can take a while —
  // real web search + fetch) doesn't look like nothing happened if the
  // admin re-opens the page while it's still running.
  await supabase.from("buy_requests").update({ status: "searching", updated_at: new Date().toISOString() }).eq("id", id);

  const found = await searchForBuyRequest(existing.description, Number(existing.target_price_gbp));

  const { data, error } = await supabase
    .from("buy_requests")
    .update({
      status: found ? "found" : "not_found",
      found_product_name: found?.productName ?? null,
      found_source_retailer: found?.sourceRetailer ?? null,
      found_source_url: found?.sourceUrl ?? null,
      found_price_gbp: found?.priceGBP ?? null,
      found_image_url: found?.imageUrl ?? null,
      searched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `buy request search run -> ${found ? "found" : "not_found"}`,
    targetType: "buy_request",
    targetId: id,
  });

  return NextResponse.json({ request: data });
}
