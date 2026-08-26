import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

// Force-dynamic: same reasoning as every other route here — reads live
// application data straight from Supabase.
export const dynamic = "force-dynamic";

/**
 * GET/POST /api/account/shopper-profiles — 26 Aug 2026, Steven: "Need an
 * accounts page so people can... add clothes and show sizes. Size info is
 * important as i want a switch on the main shopping window to ask who are
 * you shopping for." One account can hold several named profiles ("Me",
 * "Sarah") — /shop's shopping-for switch (see ShopperSwitch.tsx) picks
 * between them. Confirmed via a clarifying question: full sizing (shoe,
 * clothing, kids/baby), every field optional — "blank means show all
 * product for this" is enforced at read time in the shop API routes, not
 * here; this route just stores whatever was actually filled in.
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("shopper_profiles")
    .select("*")
    .eq("profile_id", auth.userId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data });
}

export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A name is required, e.g. \"Me\" or \"Sarah\"." }, { status: 400 });

  const toNullableText = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("shopper_profiles")
    .insert({
      profile_id: auth.userId,
      name,
      shoe_size_uk: toNullableText(body.shoeSizeUk),
      top_size: toNullableText(body.topSize),
      bottom_size: toNullableText(body.bottomSize),
      kids_shoe_size_uk: toNullableText(body.kidsShoeSizeUk),
      kids_clothing_size: toNullableText(body.kidsClothingSize),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data }, { status: 201 });
}
