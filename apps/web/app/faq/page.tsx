/**
 * 18 Sept 2026, Steven: "Also need a FAQ section, Please add this to the
 * tabs and also add 10 top possible questions and add the answers in
 * keeping in the theme." — a dedicated FAQ page, linked as its own tab in
 * SiteNav (alongside How It Works), rather than folding these into the
 * shorter three-question FAQ already living at the bottom of /how-it-works
 * (kept as-is — that one's a quick preview for people reading the
 * explainer; this is the full list). No auth gate, same as Shop/Flippy
 * Coins/How It Works — anyone should be able to read this before signing
 * up. Same rules as the rest of the site: no "AI" mentions, no explaining
 * the deal-sourcing/verification mechanism, and sell-first/no-inventory
 * throughout.
 *
 * 18 Sept 2026, Steven, later the same day: "instead of an account tab,
 * referrals, wallet, FAQ, maybe put them when you click a circle with
 * your avatar" — this page's own SiteNav tab moved into the new avatar
 * dropdown (see layout.tsx's AvatarMenu); the page itself is unchanged and
 * still reachable directly, so it also picked up the shared PageHero here
 * in the same pass as every other nav-reachable page.
 */
import PageHero from "@/app/components/PageHero";

export default function FaqPage() {
  return (
    <div className="space-y-12 py-8">
      <PageHero
        eyebrow="Frequently asked"
        title={
          <>
            Got <span className="text-gold">Questions?</span>
          </>
        }
        subtitle="Everything you need to know about buying, selling and flipping on Flipsta."
        decorations={[
          { emoji: "❓", className: "-top-4 -left-6", animate: "sway" },
          { emoji: "💡", className: "top-1 -right-7", animate: "bob" },
          { emoji: "📖", className: "-bottom-3 left-1/3 w-11 h-11", boxed: true, animate: "bob", delay: "0.4s" },
        ]}
      />

      <section className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
        {FAQS.map((f) => (
          <div key={f.q} className="card space-y-1.5">
            <div className="font-bold text-sm">{f.q}</div>
            <div className="text-xs text-textDim">{f.a}</div>
          </div>
        ))}
      </section>

      <section className="card text-center space-y-3 py-8">
        <h2 className="font-bold text-lg">Still have a question?</h2>
        <p className="text-textDim text-sm max-w-md mx-auto">
          Our support chat is in the corner of every page, or take a look at the full breakdown of how it all works.
        </p>
        <a href="/how-it-works" className="btn btn-primary">See How It Works</a>
      </section>
    </div>
  );
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is it free to join?",
    a: "Yes — creating an account is free, and every tier can browse the Shop and Live Opportunities.",
  },
  {
    q: "Do I need to hold stock myself?",
    a: "No — you sell first, so there's never any stock to hold. Once it's sold, fulfil and ship it yourself, or use Flipsta's fulfilment network to handle it for you.",
  },
  {
    q: "What's the difference between the Shop and Opportunities?",
    a: "Shop items are already secured by Flipsta and priced to buy and keep. Opportunities are for reselling — you secure the sale first, then it's sourced from the deal behind it, no inventory involved.",
  },
  {
    q: "How do Flippy Coins work?",
    a: "Flippy Coins are what you use to secure a sale on an Opportunity — bid with them, or spend more to lock one in outright with Instant Win. Top up your balance any time from your Wallet.",
  },
  {
    q: "What if I secure a sale but the deal falls through?",
    a: "It's rare, but if a deal can't be sourced after you've sold it, you're covered — any Flippy Coins spent securing it are refunded straight to your Wallet.",
  },
  {
    q: "Can I list and sell my own stock?",
    a: "Yes — add your own items from My Stock and list them for sale alongside Shop and Opportunity items, all from the same dashboard.",
  },
  {
    q: "Which marketplaces can I cross-post a sale to?",
    a: "eBay, Depop, Etsy, Whatnot and StockX — connect your accounts once from Connected Accounts, then cross-post with a single click at listing time.",
  },
  {
    q: "Who handles shipping once an item's sold?",
    a: "Your choice — fulfil and ship it yourself, or hand it off to Flipsta's fulfilment network and we'll take care of it for you.",
  },
  {
    q: "Are there any fees when I sell?",
    a: "Your subscription tier covers your monthly access. Any per-sale fees are always shown upfront before you confirm — never a surprise deduction later.",
  },
  {
    q: "How do you make sure deals are genuine?",
    a: "Every deal is checked and verified before it goes live, so what you see is real — no guesswork on your end.",
  },
];
