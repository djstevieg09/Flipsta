/**
 * 18 Sept 2026, Steven: "Need to add a how it works page" — a dedicated
 * explainer to link to from the main nav and from the homepage's compact
 * "How It Works" section (18 Sept 2026, see app/page.tsx), rather than
 * cramming everything into that four-step strip. No auth gate, same as
 * Shop/Flippy Coins — anyone should be able to read this before signing up.
 *
 * 18 Sept 2026, Steven, same day: "remove AI from the webpage... we need
 * to remove how we find the deals." Dropped every "AI" mention (now
 * "we"/"Flipsta"), and cut the Find step's explanation of the actual
 * sourcing/verification mechanism (which retailers, cross-checking
 * resale evidence on eBay/Vinted/Depop) — it now just says deals are
 * real and verified, not how that happens. Same reasoning removed the
 * FAQ that asked "how does the AI decide" outright.
 *
 * 18 Sept 2026, Steven, later the same day: "they sell the item first
 * before buying the items from our partners or sourced deals so no
 * inventory" — the Buy/Flip steps had the order backwards. Reworked to
 * Find/Sell/Source/Repeat: you secure the sale first, sourcing only
 * happens afterwards, and no stock is ever held. Matches the same fix
 * on the homepage (see app/page.tsx).
 *
 * 18 Sept 2026, Steven, later the same day: picked up the shared PageHero
 * component (see components/PageHero.tsx) in the same pass as every other
 * nav-reachable page — "mascots with relevent animations around them."
 */
import PageHero from "@/app/components/PageHero";

export default function HowItWorksPage() {
  return (
    <div className="space-y-16 py-8">
      <PageHero
        eyebrow="The full walkthrough"
        title={
          <>
            How <span className="text-gold">Flipsta</span> Works
          </>
        }
        subtitle="We do the hunting, you do the deciding. Here's what happens from a genuine discount appearing online to money landing in your wallet."
        decorations={[
          { emoji: "🧭", className: "-top-4 -left-6", animate: "sway" },
          { emoji: "🔎", className: "top-1 -right-7", animate: "bob" },
          { emoji: "💡", className: "-bottom-3 left-1/3 w-11 h-11", boxed: true, animate: "bob", delay: "0.4s" },
        ]}
      />

      <section className="space-y-10">
        {STEPS.map((step, i) => (
          <div key={step.title} className="grid md:grid-cols-[auto,1fr] gap-6 items-start">
            <div className="w-14 h-14 rounded-full border-2 border-gold text-gold font-extrabold text-xl flex items-center justify-center mx-auto md:mx-0">
              {i + 1}
            </div>
            <div className="space-y-2 text-center md:text-left">
              <h2 className="text-2xl font-extrabold text-gold">{step.title}</h2>
              <p className="text-textDim max-w-2xl mx-auto md:mx-0">{step.body}</p>
              {step.details && (
                <ul className="text-sm text-textDim space-y-1 max-w-2xl mx-auto md:mx-0 list-disc list-inside md:list-outside">
                  {step.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-extrabold text-center">
          Common <span className="text-gold">questions</span>
        </h2>
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {FAQS.map((f) => (
            <div key={f.q} className="card space-y-1.5">
              <div className="font-bold text-sm">{f.q}</div>
              <div className="text-xs text-textDim">{f.a}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card text-center space-y-3 py-8">
        <h2 className="font-bold text-lg">Ready to find your first flip?</h2>
        <p className="text-textDim text-sm max-w-md mx-auto">
          Sign up free and start browsing real opportunities today.
        </p>
        <a href="/signup" className="btn btn-primary">Get Started</a>
      </section>
    </div>
  );
}

const STEPS: { title: string; body: string; details?: string[] }[] = [
  {
    title: "Find",
    body:
      "Every day, we bring you real, currently-live deals — checked and verified, so you're never taking a guess.",
    details: [
      "Every opportunity shows its urgency tier — Hot, Standard or Stable — so you know how fast it's likely to move.",
    ],
  },
  {
    title: "Sell",
    body:
      "Use Flippy Coins to secure the sale first — bid or use Instant Win to lock one in outright, before anything is bought from the partner or sourced deal behind it. No stock, no risk. Prefer to skip reselling entirely? Everything in the Shop is priced to buy and keep at a genuine discount, no bidding required.",
  },
  {
    title: "Source",
    body:
      "Only once it's sold does sourcing happen — the item comes straight from the partner or sourced deal, no inventory ever sitting around. List the sale in one click, with cross-posting straight out to eBay, Depop, Etsy, Whatnot and StockX if you've connected those accounts, and fulfil it yourself or hand shipping off to Flipsta's fulfilment network.",
  },
  {
    title: "Repeat",
    body:
      "Profit lands in your Flipsta Wallet. Track every win in your Portfolio, refer a friend for a reward, and build your balance flip by flip.",
  },
];

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
];
