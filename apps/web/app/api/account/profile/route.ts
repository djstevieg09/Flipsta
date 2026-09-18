import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/account/profile — 18 Sept 2026, Steven: "they should also be
 * able to name themselves how they will be displayed on Flipsta." Only
 * display_name is editable here for now (see app/account/page.tsx); every
 * other profile field collected at signup — address, business name, date of
 * birth — isn't exposed to self-edit yet.
 */
export async function PATCH(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { displayName } = await req.json();
  const trimmed = typeof displayName === "string" ? displayName.trim() : "";
  if (!trimmed) return NextResponse.json({ error: "Enter a display name." }, { status: 400 });
  if (trimmed.length > 40) return NextResponse.json({ error: "Display name must be 40 characters or fewer." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, displayName: trimmed });
}
