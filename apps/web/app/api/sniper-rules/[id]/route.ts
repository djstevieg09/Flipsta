import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

/** PATCH /api/sniper-rules/:id — toggle active, or change budget/margin/category. RLS scopes this to rows the caller owns. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { active, maxBudgetGBP, minMarginPct, categoryId } = await req.json();
  const update: Record<string, unknown> = {};
  if (active !== undefined) update.active = Boolean(active);
  if (maxBudgetGBP !== undefined) {
    if (typeof maxBudgetGBP !== "number" || maxBudgetGBP <= 0) {
      return NextResponse.json({ error: "maxBudgetGBP must be a positive number." }, { status: 400 });
    }
    update.max_budget_gbp = maxBudgetGBP;
  }
  if (minMarginPct !== undefined) {
    if (typeof minMarginPct !== "number" || minMarginPct < 0 || minMarginPct > 1) {
      return NextResponse.json({ error: "minMarginPct must be between 0 and 1." }, { status: 400 });
    }
    update.min_margin_pct = minMarginPct;
  }
  if (categoryId !== undefined) update.category_id = categoryId || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sniper_rules")
    .update(update)
    .eq("id", id)
    .eq("profile_id", auth.userId)
    .select("*, categories(name)")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No such rule." }, { status: 404 });

  return NextResponse.json({ rule: data });
}

/** DELETE /api/sniper-rules/:id */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("sniper_rules").delete().eq("id", id).eq("profile_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
