/**
 * 18 Sept 2026, Steven: "the landing page looks dead, i need it to be
 * really appealing" — shared a full marketing-style mockup (a big hero
 * with the Flippy mascot, a five-item feature strip, a "How It Works"
 * section) and asked for the homepage to look like it.
 *
 * 18 Sept 2026, Steven, same day: "remove AI from the webpage, need it
 * to say we find the deals etc. we need to remove how we find the
 * deals." Every "AI" mention below is now "we"/"Flipsta" instead, and
 * nothing here explains the sourcing/verification mechanism — just that
 * a deal is real. The fuller mechanism explanation on /how-it-works was
 * cut the same way, for the same reason.
 *
 * Replaces the previous version (26 Aug 2026 — live shop items and
 * opportunities pulled client-side from /api/shop-items and
 * /api/opportunities directly onto the homepage) with a static marketing
 * hero. That live browsing experience isn't gone — it lives at its own
 * dedicated pages (/shop, /opportunities), which this page links straight
 * into via the CTAs below instead of duplicating them here. Static also
 * means this no longer needs to be a "use client" component with its own
 * fetch/loading state.
 *
 * The mockup's coin-stack/tablet-mockup graphics are custom illustrated
 * art with no source file to hand — reused the existing Flippy mascot
 * image (apps/web/public/flippy-mascot.jpg, already live on /coins)
 * instead of inventing a new asset, and replaced the tablet screenshot
 * with two small real card-style callouts (a shop deal, a live
 * opportunity) so the hero references the actual product rather than a
 * static image of a UI that will drift out of date.
 */
export default function HomePage() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="relative grid md:grid-cols-2 gap-10 md:gap-6 items-center py-8 md:py-14">
        <div className="space-y-6 text-center md:text-left">
          <span className="inline-block text-xs font-bold tracking-[0.2em] text-brand2">
            THE BUY / SELL EXCHANGE
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight">
            Welcome to
            <br />
            <span className="bg-gradient-to-r from-gold to-brand2 bg-clip-text text-transparent">FLIPSTA</span>
          </h1>
          <p className="text-xl md:text-2xl font-bold">
            Find it. <span className="text-brand2">Flip it.</span> <span className="text-gold">Profit.</span>
          </p>
          <p className="text-textDim max-w-md mx-auto md:mx-0">
            The ultimate marketplace where we find the best deals, you buy, and you sell. Powered by community.
            Built for profit.
          </p>
          <div className="flex flex-wrap gap-3 justify-center md:justify-start">
            <a href="/signup" className="btn btn-primary text-base px-6 py-3">
              Get Started →
            </a>
            <a href="/shop" className="btn btn-ghost text-base px-6 py-3">
              Browse the shop
            </a>
          </div>
        </div>

        <div className="relative flex justify-center md:justify-end">
          <span
            className="hidden md:block absolute -top-8 right-10 text-2xl text-brand2 -rotate-6"
            style={{ fontFamily: "Brush Script MT, cursive" }}
          >
            The future is here.
          </span>

          <div className="relative w-60 md:w-72">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/flippy-mascot.jpg"
              alt="Flippy, the Flipsta mascot"
              className="w-full rounded-3xl drop-shadow-[0_0_50px_rgba(242,181,69,0.35)]"
            />

            {/* Real-product callouts instead of a static screen mockup —
                shapes echo an actual shop-item card / opportunity card. */}
            <div className="card absolute -left-6 bottom-6 w-32 -rotate-6 shadow-xl hidden sm:block">
              <div className="text-[10px] text-textDim">Shop deal</div>
              <div className="text-sm font-extrabold text-gold">32% off RRP</div>
            </div>
            <div className="card absolute -right-4 top-6 w-32 rotate-6 shadow-xl hidden sm:block">
              <div className="text-[10px] font-bold uppercase text-red">Hot</div>
              <div className="text-sm font-extrabold text-green">+£24 est. profit</div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-8 border-t border-b border-border py-8 text-center md:text-left">
        {FEATURES.map((f) => (
          <div key={f.title} className="space-y-1.5">
            <div className="text-gold w-6 h-6 mx-auto md:mx-0">{f.icon}</div>
            <div className="font-bold text-sm">{f.title}</div>
            <div className="text-xs text-textDim">{f.body}</div>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section className="space-y-8 text-center">
        <h2 className="text-3xl font-extrabold">
          How It <span className="text-gold">Works</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
          {STEPS.map((s, i) => (
            <div key={s.title} className="space-y-2">
              <div className="w-10 h-10 rounded-full border-2 border-gold text-gold font-extrabold flex items-center justify-center mx-auto">
                {i + 1}
              </div>
              <div className="font-bold text-gold">{s.title}</div>
              <div className="text-xs text-textDim">{s.body}</div>
            </div>
          ))}
        </div>
        <a href="/how-it-works" className="inline-block text-xs font-bold text-brand2 hover:underline">
          See the full breakdown →
        </a>
      </section>

      {/* New here? — carried over from the previous homepage, re-themed to match. */}
      <section className="card text-center space-y-3 py-8">
        <h2 className="font-bold text-lg">New here?</h2>
        <p className="text-textDim text-sm max-w-md mx-auto">
          Sign up free to save items to your Wishlist, set your sizes so we only show you what fits, and unlock
          bidding on reseller opportunities.
        </p>
        <a href="/signup" className="btn btn-primary">Create your account</a>
      </section>
    </div>
  );
}

const FEATURES: { title: string; body: string; icon: React.ReactNode }[] = [
  { title: "We Find Deals", body: "We bring you the best opportunities, checked and verified.", icon: <BrainIcon /> },
  { title: "You Buy", body: "Grab the deals you want with Flippy Coins.", icon: <CartIcon /> },
  { title: "You Sell", body: "List your items and make a profit.", icon: <TrendIcon /> },
  { title: "Grow Together", body: "A marketplace powered by our community.", icon: <UsersIcon /> },
  { title: "Safe & Secure", body: "Built with your security in mind.", icon: <ShieldIcon /> },
];

const STEPS: { title: string; body: string }[] = [
  { title: "Find", body: "We find the best deals for you, every day." },
  { title: "Buy", body: "Use Flippy Coins to purchase opportunities." },
  { title: "Flip", body: "List and sell for a profit on our marketplace." },
  { title: "Repeat", body: "Build your balance and grow your earnings." },
];

// Simple stroke-style icons matching the header search icon's convention
// (viewBox 0 0 24 24, stroke currentColor, strokeWidth 2, fill none) —
// no icon library dependency needed for five small glyphs.
function BrainIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-1 5.8V15a3 3 0 0 0 3 3h1" />
      <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 1 5.8V15a3 3 0 0 1-3 3h-1" />
      <path d="M9 4a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3" />
      <path d="M15 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.6L21 8H6" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 15 21 6" />
      <polyline points="15 6 21 6 21 12" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="8" r="3" />
      <path d="M2.5 19a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 13.2A5 5 0 0 1 21.5 18" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
