import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { ticketSlaDueAt, TICKET_CATEGORIES } from "@flipsta/shared";

/**
 * GET /api/tickets — a user's own support tickets.
 * POST /api/tickets — open a new one. This is the only buyer/seller contact
 * channel for a dispute (Section 12.1) — there's no direct-messaging API in
 * this codebase, by design.
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("requester_id", auth.userId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tickets: data });
}

export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { category, priority, subject, body, relatedOrderId } = await req.json();
  if (!category || !subject || !body) {
    return NextResponse.json({ error: "category, subject, and body are required." }, { status: 400 });
  }
  if (!TICKET_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of: ${TICKET_CATEGORIES.join(", ")}` }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const finalPriority = priority ?? "medium";

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      category,
      priority: finalPriority,
      subject,
      body,
      requester_id: auth.userId,
      related_order_id: relatedOrderId ?? null,
      sla_due_at: ticketSlaDueAt(finalPriority, now).toISOString(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ticket: data }, { status: 201 });
}
