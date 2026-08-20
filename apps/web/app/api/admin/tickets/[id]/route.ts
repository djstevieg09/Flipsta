import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";
import { NotificationEvents } from "@/lib/notifications";

/**
 * PATCH /api/admin/tickets/[id] — update status/assignee and optionally
 * attach an internal note (Section 12.1). Notifies the requester by email
 * on a status change (Section 12.5) — this is one of the first real call
 * sites for that notification layer.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { status, assignedAdminId, note } = await req.json();
  const supabase = createSupabaseServiceClient();

  const update: Record<string, any> = {};
  if (status) {
    update.status = status;
    if (status === "resolved") update.resolved_at = new Date().toISOString();
  }
  if (assignedAdminId) update.assigned_admin_id = assignedAdminId;

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("tickets").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (note) {
    const { error: noteError } = await supabase.from("ticket_notes").insert({ ticket_id: id, admin_id: auth.userId, note });
    if (noteError) return NextResponse.json({ error: noteError.message }, { status: 500 });
  }

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: status ? `ticket status -> ${status}` : "ticket note added",
    targetType: "ticket",
    targetId: id,
    reason: note ?? null,
  });

  if (status) {
    const { data: ticket } = await supabase
      .from("tickets")
      .select("requester_id, profiles!tickets_requester_id_fkey(display_name)")
      .eq("id", id)
      .single();
    if (ticket) {
      // Stub email in dev (see apps/web/lib/notifications.ts) — no real address
      // to send to without wiring up auth.users email lookup via the service
      // client, which is a small follow-on, not a blocker for the flow itself.
      await NotificationEvents.ticketUpdated(`user-${ticket.requester_id}@example.invalid`, id, status);
    }
  }

  const { data: updated, error: fetchError } = await supabase.from("tickets").select("*").eq("id", id).single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  return NextResponse.json({ ticket: updated });
}
