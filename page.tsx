"use client";

import { useEffect, useState } from "react";

type ShopItem = {
  id: string;
  product_name: string;
  image_url: string | null;
  rrp_gbp: number;
  our_price_gbp: number;
  categories: { name: string } | null;
};

type Opportunity = {
  id: string;
  urgency_tier: "hot" | "standard" | "stable";
  estimated_resale_price_gbp: number | null;
  expected_margin_gbp: number;
  instant_win_price_gbp: number;
  status: string;
  categories: { name: string } | null;
};

/**
 * 26 Aug 2026, Steven: "We need to setup what the main flipsta page will
 * show when someone goes to the webpage. For consumers... Need a home
 * landing page that shows latest deals the site has to offer." Replaces
 * the old dev-scaffold placeholder ("This is the real, database-backed
 * application...") with a real consumer landing page — pulls straight from
 * the same public, already-redacted endpoints /shop and /opportunities use
 * (no new backend needed), so it always shows what's genuinely live right
 * now rather than curated/static content that could go stale.
 */
export default function HomePage() {
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  // 27 Aug 2026 — see @/api/recommendations' comment: empty for anyone
  // signed out or with no real purchase history / saved size yet, by
  // design — never a generic "trending" stand-in.
  const [recommended, setRecommended] = useState<ShopItem[]>([]);
  // 17 Sept 2026 — the new hero's CTA adapts for a signed-in visitor
  // (Steven's reference always shows "Get Started", but that's a strange
  // thing to say to someone who already has an account) — same
  // fetch-/api/me-client-side pattern already used elsewhere (e.g.
  // sell/new) since this is a client component and can't call
  // getCurrentProfile() directly.
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/shop-items").then((r) => r.json()),
      fetch("/api/opportunities").then((r) => r.json()),
    ]).then(([shop, opp]) => {
      setShopItems((shop.items ?? []).slice(0, 6));
      setOpportunities((opp.opportunities ?? []).filter((o: Opportunity) => o.status === "live").slice(0, 3));
      setLoading(false);
    });
    fetch("/api/recommendations")
      .then((r) => r.json())
      .then((d) => setRecommended(d.items ?? []))
      .catch(() => {});
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setIsAuthed(Boolean(d.profile)))
      .catch(() => {});
  }, []);

  const urgencyColor: Record<string, string> = { hot: "text-red", standard: "text-brand", stable: "text-brand2" };

  return (
    <div className="space-y-16">
      {/* 17 Sept 2026, Steven: shared a reference mockup and asked for the
          welcome page (flipsta.co.uk) to look like it — a big hero with
          Flippy, a single "Get Started" CTA, a 5-icon feature strip, and a
          "How It Works" step row. Built directly in the app's own design
          system (same tokens/components as everywhere else, see
          tailwind.config.ts) rather than shipping the reference image
          itself — kept the real headline text on the actual product's
          words rather than "Welcome to FLIPSTA" + filler, since the rest of
          the site already earns its keep on real copy, not a generic
          welcome banner. Deliberately skipped the reference's fake
          tablet-with-products graphic — every other "N available"/price
          shown anywhere on this site is real, live data (see the
          engagement-round dark-patterns note in the deployment checklist),
          and a static mockup of specific products/prices would be the one
          invented exception. The old plain-text hero (still functionally
          below, in spirit — Shop/Live Opportunities are one click away in
          the tab bar) is retired in favour of this.
          The original two-CTA hero is gone in favour of the reference's
          single "Get Started" button, adapted so it doesn't say that to
          someone who already has an account. */}
      <section className="relative overflow-hidden rounded-2xl border border-border">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 900px 500px at 15% 20%, rgba(242,181,69,0.16) 0%, transparent 60%), radial-gradient(ellipse 700px 500px at 85% 80%, rgba(255,215,122,0.10) 0%, transparent 60%), linear-gradient(135deg, #0a0e17 0%, #121729 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(#eef1f8 1px, transparent 1px), linear-gradient(90deg, #eef1f8 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative grid md:grid-cols-[1.2fr_0.8fr] gap-8 items-center px-8 py-14 md:px-14 md:py-20">
          <div>
            <div className="text-xs font-bold tracking-[2px] text-gold mb-4">AI DRIVEN BUY / SELL EXCHANGE</div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-3">
              Real deals, found by AI,
              <br />
              verified by <span className="text-gold">real resale data.</span>
            </h1>
            <div className="text-xl font-bold mb-5">
              Find it. <span className="text-gold">Flip it.</span> Profit.
            </div>
            <p className="text-textDim max-w-lg mb-7">
              Flipsta's AI scours retailer clearance pages every day for genuine discounts, checks what they
              actually resell for, and brings you the ones worth buying — some to keep at a real discount, some to
              flip for a profit.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {isAuthed ? (
                <a href="/shop" className="btn bg-gold text-bg inline-flex items-center gap-2">
                  Browse today's deals
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                </a>
              ) : (
                <a href="/signup" className="btn bg-gold text-bg inline-flex items-center gap-2">
                  Get Started
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                </a>
              )}
              <a href="/opportunities" className="btn btn-ghost">See Live Opportunities</a>
            </div>
          </div>
          <div className="flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/flippy-mascot.jpg" alt="Flippy, the Flipsta mascot" className="w-full max-w-[300px] rounded-2xl" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-6 py-2">
        {[
          {
            label: "AI Finds Deals",
            body: "Our AI scans the internet for the best opportunities.",
            icon: <><path d="M9.5 2a7.5 7.5 0 1 0 4.65 13.4l4.72 4.73a1 1 0 0 0 1.42-1.42l-4.73-4.72A7.5 7.5 0 0 0 9.5 2Z" /><path d="M9.5 6v3.5H13" /></>,
          },
          {
            label: "You Buy",
            body: "Grab the deals you want with Flippy Coins.",
            icon: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>,
          },
          {
            label: "You Sell",
            body: "List your items and make a profit.",
            icon: <><path d="M3 3v18h18" /><path d="M7 15v3" /><path d="M12 10v8" /><path d="M17 6v12" /></>,
          },
          {
            label: "Grow Together",
            body: "A marketplace powered by our community.",
            icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
          },
          {
            label: "Safe & Secure",
            body: "Built with your security in mind.",
            icon: <><path d="M12 2 4 6v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6z" /><path d="m9 12 2 2 4-4" /></>,
          },
        ].map((f) => (
          <div key={f.label} className="flex flex-col items-center text-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f2b545" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {f.icon}
            </svg>
            <div className="font-bold text-sm">{f.label}</div>
            <div className="text-xs text-textDim">{f.body}</div>
          </div>
        ))}
      </section>

      <section className="space-y-8 py-4">
        <h2 className="text-2xl font-extrabold text-center">
          How It <span className="text-gold">Works</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { n: 1, label: "Find", body: "Our AI spots the best deals across the web." },
            { n: 2, label: "Buy", body: "Use Flippy Coins to purchase opportunities." },
            { n: 3, label: "Flip", body: "List and sell for a profit on our marketplace." },
            { n: 4, label: "Repeat", body: "Build your balance and grow your earnings." },
          ].map((s) => (
            <div key={s.n} className="text-center space-y-2">
              <div className="mx-auto w-10 h-10 rounded-full border-2 border-gold text-gold font-extrabold flex items-center justify-center">
                {s.n}
              </div>
              <div className="font-bold text-sm">{s.label}</div>
              <div className="text-xs text-textDim max-w-[160px] mx-auto">{s.body}</div>
            </div>
          ))}
        </div>
      </section>

      {recommended.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold text-lg">Recommended for you</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {recommended.map((item) => (
              <a key={item.id} href="/shop" className="card space-y-2 hover:border-brand2 transition">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.product_name} className="w-full h-24 object-contain bg-surface2 rounded-lg border border-border" />
                ) : (
                  <div className="w-full h-24 rounded-lg border border-border" />
                )}
                <div className="font-bold text-sm line-clamp-1">{item.product_name}</div>
                <div className="font-extrabold">£{item.our_price_gbp.toFixed(2)}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Latest shop deals</h2>
          <a href="/shop" className="text-xs font-bold text-brand2 hover:underline">
            See all →
          </a>
        </div>
        {loading && <p className="text-textDim text-sm">Loading…</p>}
        {!loading && shopItems.length === 0 && (
          <p className="text-textDim text-sm">Nothing in the shop right now — check back soon.</p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {shopItems.map((item) => {
            const discountPct = Math.round(((item.rrp_gbp - item.our_price_gbp) / item.rrp_gbp) * 100);
            return (
              <a key={item.id} href="/shop" className="card space-y-2 hover:border-brand2 transition">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.product_name} className="w-full h-28 object-contain bg-surface2 rounded-lg border border-border" />
                ) : (
                  <div className="w-full h-28 rounded-lg border border-border flex items-center justify-center text-[10px] text-textFaint">
                    No photo
                  </div>
                )}
                <div className="font-bold text-sm line-clamp-1">{item.product_name}</div>
                <div className="flex items-baseline gap-2">
                  <span className="font-extrabold">£{item.our_price_gbp.toFixed(2)}</span>
                  <span className="text-xs text-textFaint line-through">£{item.rrp_gbp.toFixed(2)}</span>
                  {discountPct > 0 && <span className="text-xs text-green font-bold">{discountPct}% off</span>}
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Live reseller opportunities</h2>
          <a href="/opportunities" className="text-xs font-bold text-brand2 hover:underline">
            See all →
          </a>
        </div>
        {!loading && opportunities.length === 0 && (
          <p className="text-textDim text-sm">Nothing live right now — check back soon.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {opportunities.map((o) => (
            <a key={o.id} href="/opportunities" className="card space-y-1 hover:border-brand2 transition">
              <span className={`text-xs font-bold uppercase ${urgencyColor[o.urgency_tier]}`}>{o.urgency_tier}</span>
              <div className="text-sm text-textDim">{o.categories?.name ?? "Item"}</div>
              <div className="text-xs text-green">Est. profit £{o.expected_margin_gbp.toFixed(2)}</div>
              <div className="text-xs text-textDim">Win from £{o.instant_win_price_gbp.toFixed(2)}</div>
            </a>
          ))}
        </div>
      </section>

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
