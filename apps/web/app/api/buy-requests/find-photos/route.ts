import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { findCandidatePhotos } from "@/lib/buyRequestSearch";

export const dynamic = "force-dynamic";

/**
 * POST /api/buy-requests/find-photos — "give the user some google images
 * to choose from" (26 Aug 2026, Steven), backed by Claude's own web search
 * rather than a separate image-search API (confirmed via a clarifying
 * question). Signed-in only, same as posting the request itself — this is
 * a real (if small) AI spend per call, no point letting a signed-out
 * visitor trigger it for free.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { description } = await req.json();
  if (typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "description is required." }, { status: 400 });
  }

  const candidates = await findCandidatePhotos(description.trim());
  return NextResponse.json({ candidates });
}
