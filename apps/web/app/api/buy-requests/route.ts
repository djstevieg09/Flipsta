import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/buy-requests — "Flipsta It!" (26 Aug 2026, Steven). A
 * signed-in shopper's own requests (RLS scopes GET to their own rows
 * automatically — see migration 0020) and creating a new one. Every new
 * request starts at 'pending_approval'; an admin has to approve it before
 * any AI search spend happens (see /api/admin/buy-requests).
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("buy_requests").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests: data });
}

export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { description, targetPriceGBP, photoUrl, photoSourceUrl } = await req.json();
  if (typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "description is required." }, { status: 400 });
  }
  if (typeof targetPriceGBP !== "number" || !(targetPriceGBP > 0)) {
    return NextResponse.json({ error: "targetPriceGBP must be a positive number." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("buy_requests")
    .insert({
      requester_id: auth.userId,
      description: description.trim(),
      target_price_gbp: targetPriceGBP,
      photo_url: typeof photoUrl === "string" && photoUrl ? photoUrl : null,
      photo_source_url: typeof photoSourceUrl === "string" && photoSourceUrl ? photoSourceUrl : null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ request: data }, { status: 201 });
}
