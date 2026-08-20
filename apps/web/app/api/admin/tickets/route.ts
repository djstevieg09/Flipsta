import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { isTicketBreachingSla } from "@flipsta/shared";

/**
 * GET /api/admin/tickets?category=&status= — Section 12.1 support queue.
 * Adds a computed `breachingSla` flag per ticket rather than storing it,
 * since "is this late" only makes sense evaluated against the current time.
 */
export async function GET(req: NextRequest) {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const status = searchParams.get("status");

  const supabase = createSupabaseServiceClient();
  let query = supabase.from("tickets").select("*, profiles!tickets_requester_id_fkey(display_name)").order("created_at", { ascending: false });
  if (category) query = query.eq("category", category);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  const tickets = (data ?? []).map((t: any) => ({
    ...t,
    requesterName: t.profiles?.display_name ?? "Unknown",
    breachingSla: isTicketBreachingSla(t.status, new Date(t.sla_due_at), now),
  }));

  return NextResponse.json({ tickets });
}
