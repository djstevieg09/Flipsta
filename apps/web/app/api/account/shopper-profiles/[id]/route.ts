import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

/** PATCH /api/account/shopper-profiles/[id] — edit a profile's name/sizes. RLS (0018) already scopes this to the caller's own rows. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const toNullableText = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const update: Record<string, string | null> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    update.name = name;
  }
  if ("shoeSizeUk" in body) update.shoe_size_uk = toNullableText(body.shoeSizeUk);
  if ("topSize" in body) update.top_size = toNullableText(body.topSize);
  if ("bottomSize" in body) update.bottom_size = toNullableText(body.bottomSize);
  if ("kidsShoeSizeUk" in body) update.kids_shoe_size_uk = toNullableText(body.kidsShoeSizeUk);
  if ("kidsClothingSize" in body) update.kids_clothing_size = toNullableText(body.kidsClothingSize);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("shopper_profiles")
    .update(update)
    .eq("id", id)
    .eq("profile_id", auth.userId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}

/** DELETE /api/account/shopper-profiles/[id] — remove a shopper profile. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("shopper_profiles").delete().eq("id", id).eq("profile_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
