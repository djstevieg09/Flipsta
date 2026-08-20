import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

/**
 * POST /api/wants/:id/offer — a seller undercutting (or matching) another
 * seller on an open Buyer Want (Section 11.10's reverse auction).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { offerPriceGBP } = await req.json();
  if (typeof offerPriceGBP !== "number" || offerPriceGBP <= 0) {
    return NextResponse.json({ error: "offerPriceGBP must be a positive number." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: want, error: wantError } = await supabase
    .from("buyer_wants")
    .select("id, max_price_gbp, fulfilled_offer_id")
    .eq("id", id)
    .single();
  if (wantError || !want) return NextResponse.json({ error: "Want not found." }, { status: 404 });
  if (want.fulfilled_offer_id) return NextResponse.json({ error: "This want has already been fulfilled." }, { status: 409 });
  if (offerPriceGBP > want.max_price_gbp) {
    return NextResponse.json({ error: `Offer must be at or below the buyer's max of £${want.max_price_gbp}.` }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("want_offers")
    .insert({ want_id: id, seller_id: auth.userId, offer_price_gbp: offerPriceGBP })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ offer: data }, { status: 201 });
}
