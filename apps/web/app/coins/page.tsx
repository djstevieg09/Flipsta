/**
 * Flippy Coins shop — 16 Sept 2026, Steven: "try again as ive just made
 * this public again" (after sharing a design reference and asking for the
 * coin shop to look like it, then the real Flippy mascot image to use).
 *
 * IMPORTANT — this page is UI only, deliberately. There is no coin ledger,
 * no Stripe product/price for a coin bundle, and no opportunity-unlock gate
 * anywhere in this codebase yet (see planning/coin-economy-proposal.md —
 * still marked "proposed, not yet built" as of this page going in, with
 * real open questions: single vs. two coin types pending Steven's
 * partner's sign-off, whether the monthly allowance rolls over, and
 * whether coin cost per opportunity is flat or variable). Wiring a real
 * "Buy Now" button to Stripe here would mean charging real money for a
 * coin balance that doesn't exist anywhere in the database — worse than
 * not building the button at all. So every purchase action on this page
 * is visibly disabled with a "coming soon" state rather than faked.
 *
 * Pricing/copy below matches planning/coin-economy-proposal.md exactly
 * (£1.00 single coin; 75p/58p/45p Standard/Pro/Platinum subscriber rates;
 * the 10/25/75/150-coin bundle ladder) — update both together if either
 * changes. "Platinum" here is a display label only — the underlying
 * SubscriptionTier type in packages/shared/src/constants.ts still says
 * "elite" (see that doc's still-open items; the full Elite→Platinum
 * rename is a separate, larger piece of work that also touches Stripe
 * products and /upgrade, not done as part of this page).
 */

const TIER_RATES = [
  { name: "Standard", price: "£0.75", saving: "25% saving", highlight: false },
  { name: "Pro", price: "£0.58", saving: "42% saving", highlight: false, accentBlue: true },
  { name: "Platinum", price: "£0.45", saving: "55% saving", highlight: true },
];

const BUNDLES = [
  { name: "Starter Bundle", coins: 10, price: "£9.50", popular: false },
  { name: "Growth Bundle", coins: 25, price: "£21.25", popular: true },
  { name: "Arbitrage Bundle", coins: 75, price: "£56.25", popular: false },
  { name: "Empire Bundle", coins: 150, price: "£90.00", popular: false },
];

const FEATURES = [
  {
    label: "Better Value",
    body: "More coins, lower cost per coin.",
    icon: (
      <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
    ),
  },
  {
    label: "More Opportunities",
    body: "Unlock more AI-sourced deals and listings.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </>
    ),
  },
  {
    label: "Bigger Trading Capacity",
    body: "Buy, sell and flip more with greater flexibility.",
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 15v3" />
        <path d="M12 10v8" />
        <path d="M17 6v12" />
      </>
    ),
  },
  {
    label: "Premium Features",
    body: "Access exclusive tools and marketplace features.",
    icon: <path d="M12 2 15 9l7 1-5 5 1.2 7L12 18.5 5.8 22 7 15 2 10l7-1z" />,
  },
];

export default function CoinsPage() {
  return (
    <div className="space-y-10">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid md:grid-cols-2 gap-8 items-center p-8 md:p-12">
          <div>
            <div className="text-xs font-bold tracking-[2px] text-gold mb-3">FLIPSTA FLIPPY COINS</div>
            <h1 className="text-3xl md:text-4xl font-extrabold leading-tight mb-3">
              The currency of the <span className="text-gold">Flipsta</span> marketplace.
            </h1>
            <div className="text-xl font-bold mb-4">
              Find it. <span className="text-gold">Flip it.</span> Profit.
            </div>
            <p className="text-textDim text-sm leading-relaxed max-w-md mb-6">
              Buy Flippy Coins to unlock opportunities, purchase listings, access premium
              deals and take part in the Flipsta ecosystem.
            </p>
            <button
              type="button"
              disabled
              title="Coin purchases aren't live yet"
              className="btn bg-gold text-bg opacity-60 cursor-not-allowed inline-flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
              </svg>
              Buy Flippy Coins — coming soon
            </button>
          </div>
          <div className="flex items-center justify-center relative">
            <div
              className="absolute w-72 h-72 rounded-full blur-2xl opacity-30"
              style={{ background: "radial-gradient(circle, #f2b545 0%, transparent 70%)" }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/flippy-mascot.jpg"
              alt="Flippy, the Flipsta mascot"
              className="relative w-full max-w-xs rounded-2xl"
            />
            {/* 18 Sept 2026, Steven: "mascots with relevent animations
                around them" — this hero already had the mascot (16 Sept),
                just no animated decorations like the other pages now have
                (see components/PageHero.tsx's hero-bob/sway/spin, added
                the same day). Coin-themed rather than the generic PageHero
                component since this hero's two-column pricing layout is
                bespoke and worth keeping. */}
            <span className="absolute top-6 left-4 text-3xl select-none hero-spin" aria-hidden>🪙</span>
            <span className="absolute bottom-10 right-2 text-2xl select-none hero-bob" aria-hidden>🪙</span>
            <span className="absolute top-1/2 -right-2 text-2xl select-none hero-sway" style={{ animationDelay: "0.3s" }} aria-hidden>💰</span>
          </div>
        </div>
      </div>

      {/* PRICE PANELS */}
      <div className="grid md:grid-cols-[1fr_1.7fr] gap-5">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gold flex items-center justify-center shrink-0">
            <span className="font-extrabold text-bg text-lg">F</span>
          </div>
          <div>
            <div className="font-bold text-sm">Flippy Coins</div>
            <div className="text-xs text-textDim mb-2">One token. Endless opportunities.</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-gold">£1.00</span>
              <span className="text-xs text-textDim">per coin</span>
            </div>
            <div className="text-[11px] text-textFaint">(Standard Price)</div>
          </div>
        </div>

        <div className="card">
          <div className="mb-4">
            <div className="font-bold text-sm">Subscriber Prices</div>
            <div className="text-xs text-textDim">The more you subscribe, the more you save.</div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {TIER_RATES.map((t) => (
              <div
                key={t.name}
                className="rounded-lg border p-3"
                style={{ borderColor: t.highlight ? "#f2b545" : t.accentBlue ? "#5b7cfa88" : "#262f4a" }}
              >
                <div className="text-xs text-textDim mb-1">{t.name}</div>
                <div className={`text-xl font-extrabold ${t.highlight ? "text-gold" : ""}`}>{t.price}</div>
                <div className="text-[11px] text-textDim mb-2">per coin</div>
                <span
                  className="inline-block text-[10px] font-bold px-2 py-1 rounded-full"
                  style={{
                    background: t.highlight ? "#f2b54530" : t.accentBlue ? "#5b7cfa30" : "#ffffff14",
                    color: t.highlight ? "#f2b545" : t.accentBlue ? "#8fb0ff" : "#c7c7cc",
                  }}
                >
                  {t.saving}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* COIN BUNDLES */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f2b545" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="6" rx="8" ry="3" />
            <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
            <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
          </svg>
          <span className="text-xl font-extrabold">Coin Bundles</span>
        </div>
        <div className="text-sm text-textDim mb-5">The more you buy, the better the value.</div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {BUNDLES.map((b) => (
            <div
              key={b.name}
              className="card relative flex flex-col gap-3"
              style={b.popular ? { borderColor: "#f2b545", borderWidth: 2 } : undefined}
            >
              {b.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-bg text-[10px] font-bold tracking-wide px-3 py-1 rounded-full whitespace-nowrap">
                  MOST POPULAR
                </div>
              )}
              <div className={b.popular ? "mt-1.5" : undefined}>
                <div className="font-bold text-sm">{b.name}</div>
                <div className="text-gold font-extrabold text-lg">{b.coins} Coins</div>
              </div>
              <div className="border-t border-border pt-3 flex items-baseline justify-between">
                <span className="text-xs text-textDim">Price</span>
                <span className="text-xl font-extrabold">{b.price}</span>
              </div>
              <button
                type="button"
                disabled
                title="Coin purchases aren't live yet"
                className="btn bg-gold text-bg opacity-60 cursor-not-allowed w-full justify-center inline-flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
                </svg>
                Buy Now
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-textFaint mt-4">
          Subscribers also receive their monthly Flippy Coin allowance at their tier&apos;s per-coin rate
          shown above — these bundles are for topping up beyond that allowance.
        </p>
      </div>

      {/* FEATURES STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-b border-border py-6">
        {FEATURES.map((f) => (
          <div key={f.label} className="flex flex-col items-center text-center gap-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f2b545" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {f.icon}
            </svg>
            <div className="font-bold text-sm">{f.label}</div>
            <div className="text-xs text-textDim">{f.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
