import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

/**
 * GET /api/wallet — a seller's real transaction ledger (Section 9), powering
 * /wallet. Rows are written by apps/worker/src/jobs/releaseEscrow.ts at the
 * moment funds actually release, not simulated.
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("profile_id", auth.userId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const balanceGBP = (data ?? []).reduce((sum, t) => sum + Number(t.amount_gbp), 0);
  return NextResponse.json({ transactions: data, balanceGBP: Math.round(balanceGBP * 100) / 100 });
}
