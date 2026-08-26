/**
 * 26 Aug 2026, Steven: "we need to try and convert customers into
 * resellers." Confirmed via a clarifying question: in-app upgrade prompts
 * at natural moments, rather than an admin outreach list. Only shown to
 * free/standard tier — Pro/Elite already have this. Plain server component
 * (no state, no client interactivity) so it's cheap to drop onto any page.
 */
export default function BecomeResellerBanner() {
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3" style={{ borderColor: "#d4af37" }}>
      <div>
        <div className="font-bold text-sm">💰 Turn your buying into earning</div>
        <p className="text-xs text-textDim mt-0.5 max-w-md">
          Pro and Elite members can claim fulfillment jobs — buy a genuine discount, ship it, and earn a reward on
          top for every order. Free to try.
        </p>
      </div>
      <a
        href="/upgrade"
        className="text-xs font-bold text-white rounded-full px-4 py-2 whitespace-nowrap"
        style={{ background: "linear-gradient(135deg,#5b7cfa,#22d3ee)" }}
      >
        Become a reseller →
      </a>
    </div>
  );
}
