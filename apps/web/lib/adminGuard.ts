import { STAFF_ROLE_RANK, StaffRole } from "@flipsta/shared";
import { getCurrentProfile } from "./currentProfile";

/**
 * Section 12.1 — Ultimate Admin Dashboard. Every admin API route calls this
 * first. It re-checks the caller's role server-side on every request rather
 * than trusting a client-side check — the admin frontend pages also guard
 * navigation, but this is what actually keeps the data safe, since admin
 * routes then use the service-role Supabase client (see
 * apps/web/lib/supabase/server.ts) to read/write across every seller,
 * bypassing RLS entirely.
 */
export class AdminGuardError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function requireStaff(minRole: StaffRole = "support") {
  const auth = await getCurrentProfile();
  if (!auth) throw new AdminGuardError("Sign in required.", 401);
  if (STAFF_ROLE_RANK[auth.profile.role] < STAFF_ROLE_RANK[minRole]) {
    throw new AdminGuardError(`Staff access required (need "${minRole}" or above).`, 403);
  }
  return auth;
}
