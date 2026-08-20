import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";

/** GET /api/me — the signed-in user's own profile, for client components that need tier/role (e.g. /sell/new). */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ profile: null }, { status: 200 });
  return NextResponse.json({ profile: auth.profile });
}
