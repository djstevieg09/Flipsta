import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { rankWantOffers } from "@flipsta/shared";

/** GET /api/wants — Section 11.10 Buyer Wants, each with its ranked reverse-auction offers. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: wants, error } = await supabase
    .from("buyer_wants")
    .select("*, want_offers(*)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withRanked = (wants ?? []).map((w) => ({
    ...w,
    ranked_offers: rankWantOffers(
      (w.want_offers ?? []).map((o: any) => ({
        id: o.id,
        sellerId: o.seller_id,
        offerPriceGBP: o.offer_price_gbp,
        offeredAt: new Date(o.created_at),
      })),
      w.max_price_gbp,
    ),
  }));

  return NextResponse.json({ wants: withRanked });
}

/** POST /api/wants — post a new Buyer Want. */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { itemDescription, conditionNotes, maxPriceGBP, closesAt } = await req.json();
  if (!itemDescription || typeof maxPriceGBP !== "number" || maxPriceGBP <= 0) {
    return NextResponse.json({ error: "itemDescription and a positive maxPriceGBP are required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("buyer_wants")
    .insert({
      buyer_id: auth.userId,
      item_description: itemDescription,
      condition_notes: conditionNotes ?? null,
      max_price_gbp: maxPriceGBP,
      closes_at: closesAt ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ want: data }, { status: 201 });
}
