/**
 * Section 12.1 — every admin action (tier override, ban, manual refund,
 * ticket resolution, partner approval...) is logged with who, when, and
 * why. Every admin route that mutates something calls this once, after
 * the mutation succeeds, using the same service-role client it already
 * has open.
 */
export async function logAdminAction(
  supabase: any,
  entry: { adminId: string; action: string; targetType: string; targetId: string; reason?: string | null },
) {
  const { error } = await supabase.from("admin_audit_log").insert({
    admin_id: entry.adminId,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId,
    reason: entry.reason ?? null,
  });
  if (error) {
    // Never let an audit-log failure block the underlying action — but it
    // should be loud in the logs, since a silent gap here defeats the point.
    console.error("[adminAudit] failed to write audit log entry:", error.message, entry);
  }
}
