import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

/** GET /api/admin/chats/[id] — full transcript of one conversation, for a staff member reviewing it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { id } = await params;
  const supabase = createSupabaseServiceClient();

  const { data: conversation, error } = await supabase
    .from("chat_conversations")
    .select("id, profile_id, status, escalated_ticket_id, created_at, updated_at, profiles(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!conversation) return NextResponse.json({ error: "No such conversation." }, { status: 404 });

  const { data: messages, error: msgError } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      displayName: (conversation as any).profiles?.display_name ?? "Anonymous visitor",
      status: conversation.status,
      escalatedTicketId: conversation.escalated_ticket_id,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
    },
    messages,
  });
}
