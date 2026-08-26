import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

export const dynamic = "force-dynamic";

/**
 * POST /api/fulfillment/:id/ship — the fulfiller marking their own claimed
 * job as shipped, once they've actually gone and bought + posted the item.
 * Doesn't release any money by itself — that only happens once the buyer
 * confirms delivery (/api/shop-items/[id]/confirm-delivery), per Steven's
 * "money does not get released until the item has been delivered."
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();

  const { data: updated, error } = await supabase
    .from("shop_items")
    .update({ status: "shipped", shipped_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "fulfillment_claimed")
    .eq("fulfiller_id", auth.userId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json(
      { error: "This job isn't yours to ship, or isn't in a claimed state." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
