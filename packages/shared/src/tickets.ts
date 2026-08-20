import { TICKET_SLA_HOURS, TicketPriority, TicketStatus } from "./constants.js";

/**
 * Section 12.1 — Ultimate Admin Dashboard & Ticketing System.
 * SLA due date is computed from priority at creation time and stored on the
 * row (see supabase/migrations/0002_admin_ops.sql) so it doesn't silently
 * drift if TICKET_SLA_HOURS changes later — this function is what computes
 * it once, at insert time.
 */
export function ticketSlaDueAt(priority: TicketPriority, createdAt: Date): Date {
  const hours = TICKET_SLA_HOURS[priority];
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

/**
 * A ticket is "breaching" once its SLA due date has passed and it hasn't
 * reached a terminal state yet. Resolved tickets never breach, regardless
 * of when they were resolved relative to the SLA — the clock stops at
 * resolution, not at "now".
 */
export function isTicketBreachingSla(status: TicketStatus, slaDueAt: Date, now: Date): boolean {
  if (status === "resolved") return false;
  return now.getTime() > slaDueAt.getTime();
}
