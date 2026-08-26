import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { getBusinessMetrics } from "@/lib/businessMetrics";

// Force-dynamic: same reasoning as every other route here — live application
// data straight from Supabase, never cached.
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/business-metrics — 26 Aug 2026, Steven: "need this to show
 * me exactly where the buisness is" + "i need graphs, i need new signups."
 * The admin overview page (a server component with its own direct DB
 * access) calls getBusinessMetrics() directly rather than hitting this
 * route over HTTP — this route exists for any future client-side consumer
 * (e.g. a refresh button, a dedicated analytics page) that needs the same
 * numbers without server-component access.
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const metrics = await getBusinessMetrics(supabase);
  return NextResponse.json(metrics);
}
