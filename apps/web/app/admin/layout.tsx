import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/currentProfile";
import { STAFF_ROLE_RANK } from "@flipsta/shared";
import SundayDealsReminder from "./SundayDealsReminder";

/**
 * Section 12.1 — Ultimate Admin Dashboard. This layout is the frontend
 * half of the guard; the real enforcement is server-side on every
 * /api/admin/* route (see apps/web/lib/adminGuard.ts), since a client-side
 * redirect alone is not a security boundary — a signed-in non-staff user
 * hitting these routes directly still gets a 401/403 from the API.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getCurrentProfile();
  if (!auth || STAFF_ROLE_RANK[auth.profile.role] < STAFF_ROLE_RANK["support"]) {
    redirect("/");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold tracking-wider text-red border border-red/40 bg-red/10 rounded-full px-2 py-0.5">
            STAFF
          </span>
          <h1 className="text-xl font-extrabold">Admin</h1>
        </div>
        <span className="text-xs text-textDim">Signed in as {auth.profile.displayName} · {auth.profile.role}</span>
      </div>
      <nav className="flex gap-1 text-sm border-b border-border mb-6 -mx-1">
        <a href="/admin" className="px-3 py-2 rounded-lg hover:bg-surface2">Overview</a>
        <a href="/admin/sellers" className="px-3 py-2 rounded-lg hover:bg-surface2">Sellers</a>
        {/* 26 Aug 2026, Steven: "need to be able to manage resellers from
            this panel." */}
        <a href="/admin/resellers" className="px-3 py-2 rounded-lg hover:bg-surface2">Resellers</a>
        <a href="/admin/tickets" className="px-3 py-2 rounded-lg hover:bg-surface2">Tickets</a>
        {/* 27 Aug 2026, Steven: "need to set this up on the admin dashboard
            aswell so we can track who we have spoken to etc." — the support
            chatbot widget. */}
        <a href="/admin/chats" className="px-3 py-2 rounded-lg hover:bg-surface2">Support Chats</a>
        <a href="/admin/partners" className="px-3 py-2 rounded-lg hover:bg-surface2">Partners</a>
        {/* 26 Aug 2026, Steven: "if any pictures missing from listings it
            goes to admin dashboard to add a picture before its uploaded to
            shop." */}
        <a href="/admin/shop-photos" className="px-3 py-2 rounded-lg hover:bg-surface2">Shop photos</a>
        <a href="/admin/risk" className="px-3 py-2 rounded-lg hover:bg-surface2">Risk &amp; Fraud</a>
        {/* 27 Aug 2026, Steven: "is buyback insurance setup? need to do
            this if not." */}
        <a href="/admin/buyback-claims" className="px-3 py-2 rounded-lg hover:bg-surface2">Buyback Claims</a>
        <a href="/admin/audit" className="px-3 py-2 rounded-lg hover:bg-surface2">Audit Log</a>
        {/* 26 Aug 2026, Steven: "in the admin dashboard i need to be able
            to chosse what the AI should focus on when finding deals." +
            the seasonal "Full calendar" ask. */}
        <a href="/admin/discovery-focus" className="px-3 py-2 rounded-lg hover:bg-surface2">AI Focus</a>
        <a href="/admin/seasonal" className="px-3 py-2 rounded-lg hover:bg-surface2">Seasonal Calendar</a>
        {/* 26 Aug 2026, Steven: "this then goes to admin panel to approve" — Flipsta It! */}
        <a href="/admin/buy-requests" className="px-3 py-2 rounded-lg hover:bg-surface2">Flipsta It! Requests</a>
        {/* 27 Aug 2026, Steven: "i need assistance setting up Awin api to
            fill my store with goods... this is seperate from our core
            buisness." */}
        <a href="/admin/partner-deals" className="px-3 py-2 rounded-lg hover:bg-surface2">Partner Deals</a>
      </nav>
      <SundayDealsReminder />
      {children}
    </div>
  );
}
