import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/currentProfile";
import { STAFF_ROLE_RANK } from "@flipsta/shared";
import SundayDealsReminder from "./SundayDealsReminder";

/**
 * 19 Sept 2026, Steven: "on the admin panel the tabs are too long across
 * the top, can you suggest a way to make it more readble." 20 tabs in one
 * horizontal row no longer fit — moved off the top axis into a grouped
 * left sidebar instead (the standard pattern once an admin dashboard has
 * this many sections), so nothing needs to scroll or hide behind a "more"
 * menu to be reachable. Groups are purely a navigation aid — same routes,
 * same guard, same children, just organised into six scannable clusters
 * instead of one long unbroken line.
 */
const ADMIN_NAV_GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  { label: "", items: [{ href: "/admin", label: "Overview" }] },
  {
    label: "People",
    items: [
      { href: "/admin/sellers", label: "Sellers" },
      // 26 Aug 2026, Steven: "need to be able to manage resellers from this panel."
      { href: "/admin/resellers", label: "Resellers" },
      { href: "/admin/partners", label: "Partners" },
    ],
  },
  {
    label: "Support & Risk",
    items: [
      { href: "/admin/tickets", label: "Tickets" },
      // 27 Aug 2026, Steven: "need to set this up on the admin dashboard
      // aswell so we can track who we have spoken to etc." — the support
      // chatbot widget.
      { href: "/admin/chats", label: "Support Chats" },
      { href: "/admin/risk", label: "Risk & Fraud" },
      // 27 Aug 2026, Steven: "is buyback insurance setup? need to do this if not."
      { href: "/admin/buyback-claims", label: "Buyback Claims" },
      { href: "/admin/audit", label: "Audit Log" },
    ],
  },
  {
    label: "Growth & AI",
    items: [
      // 26 Aug 2026, Steven: "in the admin dashboard i need to be able to
      // chosse what the AI should focus on when finding deals." + the
      // seasonal "Full calendar" ask.
      { href: "/admin/discovery-focus", label: "AI Focus" },
      { href: "/admin/seasonal", label: "Seasonal Calendar" },
      // 18 Sept 2026, Steven, after asking what's hottest on TikTok right
      // now: "yes add this to make the bot clever."
      { href: "/admin/trending", label: "Trending Signals" },
      // 18 Sept 2026, Steven: "i need to setup resend so it can send emails
      // for sign ups and promo stuff."
      { href: "/admin/broadcasts", label: "Broadcasts" },
    ],
  },
  {
    label: "Marketplace",
    items: [
      // 26 Aug 2026, Steven: "if any pictures missing from listings it goes
      // to admin dashboard to add a picture before its uploaded to shop."
      { href: "/admin/shop-photos", label: "Shop photos" },
      // 26 Aug 2026, Steven: "this then goes to admin panel to approve" — Flipsta It!
      { href: "/admin/buy-requests", label: "Flipsta It! Requests" },
      // 27 Aug 2026, Steven: "i need assistance setting up Awin api to fill
      // my store with goods... this is seperate from our core buisness."
      { href: "/admin/partner-deals", label: "Partner Deals" },
    ],
  },
  {
    label: "Commerce",
    items: [
      // 18 Sept 2026, Steven: "i need to be able to add flippy coins to
      // peoples flip wallet... add a tab wallet admin."
      { href: "/admin/wallet-admin", label: "Wallet Admin" },
      // 18 Sept 2026, Steven: "need to add a merch tab... with tshirts,
      // caps and other items that people can buy." Where a paid order
      // actually gets fulfilled from.
      { href: "/admin/merch-orders", label: "Merch Orders" },
      // 18 Sept 2026, Steven: "add ali express products and add them into
      // our shop with a 25% markup and when someone orders it then a
      // dropship order is created."
      { href: "/admin/dropship-products", label: "Dropship Products" },
      { href: "/admin/dropship-orders", label: "Dropship Orders" },
    ],
  },
];

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
      <div className="flex gap-6 items-start">
        <nav className="w-48 shrink-0 text-sm space-y-5">
          {ADMIN_NAV_GROUPS.map((group) => (
            <div key={group.label || "top"}>
              {group.label && (
                <div className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-textFaint">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="block px-3 py-2 rounded-lg text-textDim hover:bg-surface2 hover:text-text"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="flex-1 min-w-0">
          <SundayDealsReminder />
          {children}
        </div>
      </div>
    </div>
  );
}
