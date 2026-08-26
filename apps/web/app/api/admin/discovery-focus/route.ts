import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

// Force-dynamic: same reasoning as every other admin route — live data,
// never cached (see api/admin/partners/route.ts's comment for the real
// incident that made this the standard).
export const dynamic = "force-dynamic";

/**
 * GET/PATCH /api/admin/discovery-focus — 26 Aug 2026, Steven: "in the admin
 * dashboard i need to be able to chosse what the AI should focus on when
 * finding deals." Backed by migration 0019's discovery_focus table, read
 * each discovery run by claudeSearchAdapter.ts (via DiscoveryContext, see
 * apps/worker/src/adapters/sourceAdapter.ts) to skip paused categories and
 * steer the search prompt with an admin's note.
 *
 * A category with no discovery_focus row just means "active, no note" —
 * GET always returns every real category regardless, defaulting the
 * uncustomized ones, so the admin page has a complete, predictable list to
 * render rather than only showing categories someone has already touched.
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const [{ data: categories, error: catError }, { data: focusRows, error: focusError }] = await Promise.all([
    supabase.from("categories").select("slug, name").order("name"),
    supabase.from("discovery_focus").select("category_slug, status, focus_note, updated_at"),
  ]);
  if (catError) return NextResponse.json({ error: catError.message }, { status: 500 });
  if (focusError) return NextResponse.json({ error: focusError.message }, { status: 500 });

  const focusBySlug = new Map<string, { status: string; focus_note: string | null; updated_at: string }>(
    (focusRows ?? []).map((r: any) => [r.category_slug, r]),
  );
  const result = (categories ?? []).map((c: any) => {
    const row = focusBySlug.get(c.slug);
    return {
      categorySlug: c.slug,
      categoryName: c.name,
      status: row?.status ?? "active",
      focusNote: row?.focus_note ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  });

  return NextResponse.json({ focus: result });
}

/** Upserts one category's focus row by category_slug — the admin page
 * calls this per-category (pause/resume, or save a note), never a bulk
 * write. */
export async function PATCH(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { categorySlug, status, focusNote } = await req.json();
  if (!categorySlug || typeof categorySlug !== "string") {
    return NextResponse.json({ error: "categorySlug is required." }, { status: 400 });
  }
  if (status && status !== "active" && status !== "paused") {
    return NextResponse.json({ error: "status must be 'active' or 'paused'." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("discovery_focus")
    .upsert(
      {
        category_slug: categorySlug,
        status: status ?? "active",
        focus_note: typeof focusNote === "string" && focusNote.trim() ? focusNote.trim() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "category_slug" },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `discovery focus for "${categorySlug}" -> status=${status ?? "active"}${focusNote ? ", note set" : ""}`,
    targetType: "discovery_focus",
    targetId: categorySlug,
  });

  return NextResponse.json({
    focus: {
      categorySlug: data.category_slug,
      status: data.status,
      focusNote: data.focus_note,
      updatedAt: data.updated_at,
    },
  });
}
