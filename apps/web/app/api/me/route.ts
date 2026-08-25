import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";

// Force-dynamic: every route here reads live application data (bids, wallet
// balances, opportunities, order status) straight from Supabase. Without this,
// Next.js's App Router can cache a GET route's first response (including the
// fetch calls a library like supabase-js makes under the hood) and keep
// serving that same stale response indefinitely, even after the database
// changes underneath it — exactly what caused real, freshly-discovered
// opportunities to not show up on /opportunities on 25 Aug 2026.
export const dynamic = "force-dynamic";

/** GET /api/me — the signed-in user's own profile, for client components that need tier/role (e.g. /sell/new). */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ profile: null }, { status: 200 });
  return NextResponse.json({ profile: auth.profile });
}
