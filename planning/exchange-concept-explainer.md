# Flipsta — AI-Driven Buy/Sell Exchange: Business Concept & Model

*A UK-focused planning document. Last updated August 2026.*

**Brand status:** Name selected — **Flipsta**. flipsta.co.uk has been purchased. Recommended next steps before public commitment: (1) confirm/secure flipsta.com if still available (domain checks on it have been inconclusive — worth a direct registrar lookup, e.g. Nominet/GoDaddy/123-reg); (2) register "Flipsta" as a UK limited company name at Companies House to lock it down (name availability not currently taken as of this check); (3) run a formal UK trademark search via the IPO (gov.uk trademark search) before public launch — this planning-stage check is not a substitute for that; (4) secure matching social handles (no direct conflicts found on a quick check, but not exhaustively verified).

---

## Contents

1. Executive Summary
2. Theory of Operation
3. The Two Models
   - 3.1 Version 1: The Short-Selling Exchange
   - 3.2 Version 2: The Opportunity Auction (recommended starting point)
4. Proof of Concept: A Real Deal
5. Protecting the Opportunity (The Blind Teaser Mechanism)
6. What Makes This Stand Out
   - 6.1 Core Differentiators
   - 6.2 Second Round of Ideas
   - 6.3 Widening the Sourcing Pool Internationally
7. Subscription Tiers & Features
8. Monetisation
   - 8.1 Marketplace Commission
   - 8.2 Affiliate Revenue
   - 8.3 Buyback Guarantee — Per-Purchase Insurance Model
   - 8.4 Risk Management: Concentration Risk & Reserves
9. Financial Projections
   - 9.1 Running Costs by Scale
   - 9.2 Revenue at 100 Users
   - 9.3 Revenue at 10,000 Users
   - 9.4 Tiered Pricing Uplift
   - 9.5 Tier Profitability: Pro vs Elite
10. Logistics & Fulfilment
    - 10.1 Domestic Courier Comparison
    - 10.2 International Case Study: Japan vs Europe
11. Operational Mechanics & Risk Controls
    - 11.1 Dynamic Action Clock ("Deal Heat")
    - 11.2 Batch Relisting & Market Depth Risk
    - 11.3 Starting Bid & Instant-Win Pricing
    - 11.4 Order Matching — Price-Time Priority
    - 11.5 Trade & Wholesale Seller Channel
    - 11.6 Buyback Anti-Abuse Safeguards
    - 11.7 Cross-Border Overflow Logic
    - 11.8 Limit-Sell Orders
    - 11.9 Courier Integration in the Seller Dashboard
    - 11.10 Buyer Want Requests (Demand-Pull Sourcing)
12. Platform Operations, Trust & Compliance
    - 12.1 Ultimate Admin Dashboard & Ticketing System
    - 12.2 Supplier & Courier Partner Programme
    - 12.3 Global Design Convention — Header & Navigation
    - 12.4 Reviews & Seller Ratings
    - 12.5 Notifications
    - 12.6 Seller Tax Reporting & HMRC Digital Platform Reporting
    - 12.7 Legal Documentation
13. Starting Recommendation & Roadmap

---

## 1. Executive Summary

**Flipsta** is a marketplace where people can sell a product **before they own it** — like a stock market, but for real goods — with AI doing the hunting to actually source the item at a lower price before a delivery deadline.

Two versions of the idea sit in this plan: a bold, structurally novel "short-selling exchange" (Version 1), and a simpler, lower-risk "opportunity auction" (Version 2) that's recommended as the actual starting point. Everything below — a live proof-of-concept deal, running costs, revenue projections, subscription tiers, commission structure, insurance mechanics, and logistics — is built around getting Version 2 live first.

---

## 2. Theory of Operation

This is how the system actually works end to end, as a mechanism — the pipeline every opportunity moves through, from discovery to settlement.

**1. Discovery.** The AI continuously monitors approved retail and resale sources — official APIs and paid data feeds wherever possible (Keepa, retailer affiliate feeds, eBay's developer API), direct site checks where necessary — comparing purchase price against realistic resale value across multiple destination markets. Discovery isn't purely supply-driven either — buyer-posted Want Requests (Section 11.10) feed the same engine with real, guaranteed-buyer demand signals.

**2. Verification.** Every candidate gets scored, not just priced: a confidence score (how likely it is to sell as predicted), expected margin, typical time-to-sell, and — critically — **market depth**, meaning whether the destination resale market can actually absorb the available quantity without the price collapsing under its own supply. Low-confidence or thin-depth candidates are discarded before a user ever sees them.

**3. Packaging as an "opportunity."** Candidates that clear the confidence and margin bar become listings, but redacted — see Section 5 for the full mechanism. Category, source tier, margin band, confidence score, a Buy/Hold/Avoid rating, and estimated available stock are shown; the exact retailer, product link, price, and photo are withheld.

**4. Distribution.** Opportunities enter the live feed. Timing of visibility is tier-gated — Pro and Elite subscribers get an early-access window before Standard sees the same listing (Section 7).

**5. Acquisition.** Users bid in a live, decaying/ascending auction for the exclusive right to act on the opportunity — or pay a calculated instant-win price to skip the auction and win outright (Section 11.3). Eligible users can delegate this to **sniper mode** — automatic bidding against pre-set rules (category, budget, minimum margin). The instant someone wins, payment is captured immediately (card on file at registration) and full detail unlocks right away, starting an action clock that scales with how volatile the deal is — faster for hot, fast-decaying opportunities, more relaxed for stable ones (Section 11.1).

**6. Fulfilment.** The winner purchases the underlying item from the source retailer — manually, or AI-assisted — routed through the platform's own tracked affiliate link wherever available, capturing a retailer affiliate commission independent of the auction fee (Section 8.2). Shipping is arranged via the platform's recommended courier (Section 10.1).

**7. Protection (optional).** At the point of purchase, the user can opt into buyback insurance for that specific item, priced dynamically off its own AI confidence score rather than a flat rate (Section 8.3).

**8. Resale.** The user lists the item — either externally (eBay, Vinted, Facebook, with one-click multi-platform listing where built) or through the platform's own internal marketplace, which carries a lower, subscription-tiered commission than external platforms (Section 8.1) and is designed to keep the full transaction lifecycle, and its data, inside the platform.

**9. Settlement.** On sale, the platform has now collected: the original auction fee, any affiliate commission on the retailer purchase, and a marketplace commission on the resale if it happened internally. If the item didn't sell in time and was insured, the buyback guarantee pays out the pre-agreed floor percentage, funded by the premium collected at step 7 plus the platform's risk reserve.

**10. Feedback loop.** Every outcome — sold or unsold, actual price versus predicted — feeds back into the AI's confidence-scoring model. This is what makes the system self-improving: predictions get more accurate and insurance pricing gets better calibrated the more real transactions flow through it, rather than staying fixed at launch-day assumptions.

---

## 3. The Two Models

### 3.1 Version 1: The Short-Selling Exchange (the "boom" idea)

**Plain English:** On a normal resale site (eBay, StockX, Vinted), you have to already own the item before you can sell it. This flips that. A seller can agree to sell something at today's price *without owning it yet*, then has 48 hours to go find it somewhere cheaper. If they pull it off, they pocket the difference. If they can't, the trade unwinds and they pay a small penalty.

**Worked example.** Say a pair of limited-edition trainers is trading actively on the platform.

1. **A buyer places a bid:** "I'll pay £200 for these trainers, size 9, right now." This bid sits live on the exchange, visible to everyone — just like a bid on a stock.
2. **A seller accepts the bid — but doesn't have the trainers yet.** They believe they can source a pair cheaper elsewhere. They accept anyway. This is the "short" position. The platform holds the buyer's £200 in escrow and gives the seller a 48-hour clock.
3. **The AI gets to work**, continuously scanning retailer clearance stock, other resale platforms, and overseas listings for that exact pair, size, and condition. It finds a listing at a smaller retailer for £160 including delivery, and flags it to the seller (or, once trusted, buys it automatically within a pre-set budget).
4. **The seller buys at £160**, has it authenticated and shipped through the platform, and delivers it to fulfil the original £200 bid.
5. **Settlement:** Buyer gets their trainers for £200. Seller made £200 − £160 (cost) − £10 (platform fee) = **£30 profit**, without ever holding speculative stock beforehand.
6. **If the seller can't source it in time:** the buyer's £200 is refunded from escrow, and the seller forfeits a small penalty for failing to deliver.

**Why it's genuinely new.** Existing platforms like StockX already have a live bid/ask system, but everyone still has to hold the item first — it's a spot market. Letting people trade the *price gap itself*, before they own the stock, is the piece nobody's doing yet.

**The catch, honestly.** A contract where someone agrees to deliver a physical good at a locked-in future price is, structurally, a **forward/futures contract**. In the UK, once these become standardised and tradeable — especially if a position could ever be settled in cash instead of an actual delivery — they risk falling under FCA regulation as a "specified investment" (Regulated Activities Order, Articles 84–90). Running that kind of regulated activity without authorisation is a criminal offence under the Financial Services and Markets Act 2000. This is fixable with the right structuring (always requiring physical delivery, capping position sizes, never allowing cash-only close-out) — but it needs a UK financial services solicitor's sign-off before this version goes live.

### 3.2 Version 2: The Opportunity Auction (recommended starting point)

**Plain English:** Instead of trading the goods, you trade the *tip*. The AI finds a genuine deal, verifies the margin is real, and auctions off the right to act on it — like a decaying-price ticket that anyone in your subscriber base can grab.

**Worked example.**

1. The AI spots a clearance line on a UK retailer's site: item priced at £45, reliably reselling for around £85 on eBay after fees — a solid margin.
2. The platform posts this as a live "opportunity" with an asking price of £15 for exclusive rights to act on it, ticking down over 30 minutes if nobody bites.
3. A subscriber grabs it for £12, gaining exclusive rights for the next hour.
4. They buy the item themselves and resell it, keeping the (roughly) £40 margin, minus their own fees and effort.
5. The platform never touches the item, never takes delivery risk, and earns its cut from the auction fee alone.

This is much closer to what existing subscription-tool competitors do, just with a live, AI-priced auction layer on top instead of a flat monthly fee — far simpler and safer to launch first.

---

## 4. Proof of Concept: A Real Deal

To sanity-check that the AI-matching idea actually works, a live search was run (August 2026) rather than a hypothetical.

**The deal:** LEGO Technic 42211 (Lunar Outpost Moon Rover), marked "Retiring soon," found at **£53.99 direct from LEGO.com**, down from £89.99 (-40%) — verified live on LEGO's own UK site, in stock, free delivery, limit 5 per customer.

**The resale check**, cross-referenced against BrickEconomy's live market data: current secondary market average £76 (flagged by the data itself as "currently low" — this set typically trades £90–99), Amazon UK listing it live at £78.99, Bricklink lowest at £78.99.

**The maths**, done conservatively (selling at the low £76 average, not the typical £90–99, with postage charged separately):

- Buy: £53.99
- Sell: £82 total to buyer (£76 item + £6 postage)
- Less eBay fees (~12.8% + 30p ≈ £10.79) and postage cost (~£6)
- Net: ~£65.20
- **Profit: ~£11.20, a 20.8% margin** — even using the pessimistic resale figure.

Caveats: LEGO limits orders to 5 units, so this isn't a bulk play; margin depends on keeping the set "new, sealed"; deals like this tend to sell out once they trend on deal sites.

**Why this matters beyond the one deal:** finding it required real live browsing — eBay itself blocked an automated price check with a bot-detection page mid-search, a preview of the operational challenge covered in Section 9.

---

## 5. Protecting the Opportunity (The Blind Teaser Mechanism)

The obvious risk: if a bidder can see enough detail to identify the exact product, they'll just go and buy it themselves without paying for the win. This is the same problem M&A brokers and real-estate wholesalers solve with a **"blind teaser"** — publish an anonymised profile, reveal the real identity only once the buyer has committed.

**What the teaser shows:** category and subcategory (e.g. "Technic — large construction set," not the exact product), a source *tier* rather than the exact retailer ("major UK high-street clearance," not "LEGO.com"), expected margin as a percentage band plus an AI confidence score, roughly how much stock is available, and an estimate of how long the window will stay open.

**What it withholds:** the exact retailer, the product page link, the specific price, and — easy to overlook — the exact photo. A cropped real photo can be reverse-image-searched straight back to the source page even with the brand name blanked out, so a generic category stock image is used instead.

**The mechanism that actually stops free-riding is making the bid binding, not the redaction.** Redacted info only slows someone down. What closes the loop is capturing payment the instant someone wins — card on file at registration, charged immediately, full detail unlocked right away, with an action clock that scales to how hot the deal is (Section 11.1).

**On top of that:** ToS prohibiting sharing or reselling revealed details; monitoring for accounts that bid often but rarely follow through on the purchase; gating sharper teaser detail behind an established track record.

**Honest limit:** none of this is airtight — a determined bidder with a reverse-image search can sometimes still crack a teaser. The realistic goal is raising the cost and risk of circumventing the paywall high enough that most people just pay.

---

## 6. What Makes This Stand Out

Every competitor tool in this space (Tactical Arbitrage, Jungle Scout, BuyBotPro) is a solitary, utilitarian dashboard — a spreadsheet of price gaps, nothing more. The "stock market" framing gives permission to borrow what makes trading apps and live-auction platforms genuinely engaging, which none of these arbitrage tools have bothered to do.

### 6.1 Core Differentiators

**A real portfolio view, not just a deal feed.** A running P&L dashboard per user — total profit this month, win rate, best category, a streak counter for consecutive profitable flips. Reframes the product from "here's a tool" to "here's your trading account."

**Make the auction social, not solitary.** A live feed of other users bidding in real time, a shared countdown, reactions — the same energy that makes live-shopping platforms like Whatnot work.

**Let people pool bids on bigger opportunities.** A "syndicate" mechanic — a handful of users chip in together for the right to a higher-value deal and split the profit proportionally.

**A "sniper mode" for trusted users.** Once AI risk-scoring has enough history on someone, let them set rules and opt into fully automatic execution with no manual bidding — the single most exciting feature in the plan.

**A free, public "Flip Index."** A weekly index of which categories are running hottest for arbitrage margin, generated from data the platform already has — shareable novelty content that drives free organic traffic.

**Publish the AI's own track record.** A public, honest accuracy score turns trust into a marketing feature, and none of the competitors are doing this.

*Priority call: sniper mode, the live social auction feed, and the syndicate mechanic change the* feel *of the product rather than just adding a feature — prioritise these over the index/transparency ideas.*

### 6.2 Second Round of Ideas

**A buyback guarantee.** Removes the fear of getting stuck holding unsold stock — see Section 8.3 for the finalised per-purchase pricing model.

**Auto-generated listing help once someone wins.** Have the AI draft the resale listing itself — title, description, suggested price, best time to post — the moment someone wins.

**One-click multi-platform listing, with auto-removal everywhere once it sells.** List simultaneously to eBay, Vinted, and Facebook Marketplace; the moment it sells on one, pull it from the others automatically.

**A "Buy / Hold / Avoid" rating per opportunity**, not just a margin percentage — a composite score factoring in expected margin, typical time-to-sell, and return/complaint risk.

**A referral loop.** Directly attacks the cold-start liquidity problem — give existing users a real incentive to bring friends in, growing the bidding pool faster than organic signups alone.

**A demo/practice mode for new sign-ups** — bid with fake credits on real, live opportunities before risking real money.

*Updated priority call: the buyback guarantee and the referral loop are the two to push hardest on — one removes the biggest reason people hesitate to bid, the other solves the recurring liquidity weak point.*

### 6.3 Widening the Sourcing Pool Internationally

Every competitor tool in this space is UK-only. If the AI is already doing price comparison, it's a relatively small step to also compare US or EU clearance pricing against UK resale value, converting currency and factoring in import duty automatically — a structurally larger pool of opportunities than any local-only tool can offer. Treat as a scope expansion once the UK-only version is proven, not a day-one requirement — see Section 10.2 for why this needs care, not blind optimism.

---

## 7. Subscription Tiers & Features

| | **Free** (£0) | **Standard** (~£15/mo) | **Pro** (~£35–45/mo) | **Elite** (~£85–120/mo) |
|---|---|---|---|---|
| **Access & bidding** | Browse public Flip Index & AI accuracy score; redacted teasers only, no bidding; demo/practice mode with fake credits | Full bidding on the live feed; one sector follow; standard teaser detail | Everything in Standard, plus **early access** — 5–10 min head start on new opportunities; unlimited sector follows | Everything in Pro, plus **syndicate leadership** — pool capital from other users; highest sniper budget limits |
| **AI tools** | Buy/Hold/Avoid rating shown on teasers | Buy/Hold/Avoid rating; basic portfolio dashboard (P&L, win rate, streak counter) | AI "why" explainability on every opportunity; **sniper mode** (automatic bidding within set rules); auto-generated resale listing drafts | Same AI toolset as Pro, with priority processing for sniper mode execution |
| **Selling & fees** | Not eligible to sell on the internal marketplace | Internal marketplace at **12% commission** | Internal marketplace at **8% commission**; one-click multi-platform listing (eBay/Vinted/Facebook with auto-delist) | Internal marketplace at **5% commission** |
| **Buyback insurance** | Not eligible | Full price, per-purchase (Section 8.3) | **~20–30% discount** on the calculated per-purchase price | **~20–30% discount** on the calculated per-purchase price, plus priority claims handling |
| **Support & extras** | Community/self-serve only | Standard self-serve support | Faster-response support | Priority human support; dedicated account analytics; data export/API access |

**Why early access is the strongest lever:** the marketplace is inherently time-decaying, so a genuine head start on a fresh opportunity is a reason to pay more that's native to how the product works, not a feature bolted on purely for pricing.

**Pricing psychology worth building in deliberately:** present Pro as the visually "recommended" middle option against the pricier Elite anchor (classic good/better/best structure), and offer annual billing at roughly 15–20% off to improve retention and cash flow.

---

## 8. Monetisation

### 8.1 Marketplace Commission

When a user sells through the platform's own internal marketplace rather than taking the item to eBay or Vinted, the platform earns a commission — tiered to reward higher subscriptions, on the same principle as StockX's volume-based seller fees (9.5% down to 8% as sellers hit sales thresholds).

| Tier | Internal marketplace commission |
|---|---|
| Free | Not eligible — must upgrade to sell |
| Standard | **12%** |
| Pro | **8%** |
| Elite | **5%** |

This deliberately undercuts eBay (~13–16% all-in) and Depop (~13–15%), giving users a real financial reason to sell on-platform instead of walking the transaction off to an external marketplace once they've won an opportunity — keeping the full transaction, and its data, inside the platform. Fulfilment within the internal marketplace follows price-time priority — lowest asking price sells first (Section 11.4).

A separate **Trade & Wholesale Seller** channel — for distributors offloading bulk clearance stock directly, rather than winning AI-sourced opportunities — sits outside this tier table entirely, with its own volume-tiered commission (Section 11.5).

### 8.2 Affiliate Revenue

Two independent affiliate revenue streams sit alongside the auction fee and marketplace commission:

**Retailer affiliate commission.** When a winning bidder clicks through the platform's own tracked link to buy from the source retailer, the retailer typically pays a small commission — for LEGO UK, roughly **2.4%–5% per sale** (via Rakuten Advertising or FlexOffers, cookie windows of 7–30 days). This only works if the purchase is routed through the platform's own tracked link. It does **not** apply if the platform itself is the buyer (Version 1's model) — that's a purchase, not a referral, and affiliate programmes explicitly prohibit claiming commission on your own purchases.

**Shipping/courier affiliate commission.** DPD (Section 10.1) runs its own affiliate programme via the Shopper.com network, paying **5–10% commission per referred booking**, 1-month cookie window. A broker option, ParcelBroker, covers multiple couriers including DPD under one affiliate relationship rather than per-carrier deals. Every time the platform routes a user to book shipping — not just the retailer purchase — that's a second, independent commission opportunity on the same transaction.

### 8.3 Buyback Guarantee — Per-Purchase Insurance Model

**This is the finalised mechanism, replacing an earlier flat monthly bolt-on design that didn't hold up under scrutiny (see the pricing failure analysis below for why).**

**How it works:** at the moment a user wins an opportunity and is about to buy it, the guarantee is offered as an add-on for that specific item — protection paying back 70% of the purchase price if it doesn't sell within the guarantee window, priced dynamically for that item alone rather than as a flat subscription add-on.

**The pricing formula:**

> premium = (estimated chance of failure × 70% payout × item price) ÷ target margin buffer (≈0.6)

Using the AI's own confidence score as the failure-probability input: a solid, high-confidence £65 opportunity with an estimated 8% chance of not selling costs around **£6** to protect; a shakier £65 opportunity with a 20% estimated failure chance costs closer to **£15**. This applies uniformly across all subscription tiers — Pro and Elite receive a 20–30% discount on the calculated price as a paid-tier perk, rather than the guarantee being bundled in free (see the flawed pricing this replaces, below).

**Why per-purchase beats a flat monthly bolt-on — the numbers that killed the original design:**

A flat bolt-on structure was tested at £10/month for £1,000 max cover, £20/month for £2,500, £30/month for £5,000, all at a 70% floor. Checked against a 10% assumed failure rate, the premium only covered 9–14% of the expected claims cost at each tier — meaning it would lose money steadily, not just in a bad month, and the underpricing got *worse* at higher tiers, which is backwards. For that flat pricing to actually work, the real failure rate would need to be under roughly 1% — an assumption with no data behind it pre-launch.

Per-purchase, risk-based pricing solves this properly:

- **It prices each item on its own real risk**, via the AI confidence score already computed as part of the core product, rather than a blanket rate averaged across everyone.
- **It generates real claims data immediately** — every insured purchase becomes a data point (did it sell or not, against what was predicted), letting the failure-rate-to-price mapping be recalibrated continuously rather than guessed at for months.
- **It self-adjusts against herd risk.** If many users pile into the same hot opportunity, the AI's confidence score for that item should already be dropping (market-depth concerns per Section 2), which pushes the insurance price for that specific item up automatically — a natural brake on exactly the concentration risk described in Section 8.4.
- **It converts a checkout moment into an upsell** — offering protection right when someone is about to commit money is a proven, well-converting pattern (extended warranties, travel insurance), likely driving stronger uptake than a separate monthly subscription decision.

**Correct pricing alone doesn't stop opportunistic claims** — see Section 11.6 for the proof-of-genuine-sale-attempt requirement that closes that gap.

### 8.4 Risk Management: Concentration Risk & Reserves

Per-purchase pricing protects the *average* case. It does not, by itself, protect against a correlated failure — the scenario where many units of the *same* item all fail to sell at once because the underlying call was wrong, not because of independent bad luck.

**Illustrative worst case:** 5,000 units bought at £100 each (£500,000 total exposure) all failing to sell would trigger a **£375,000 payout** at a 70% floor — far beyond what premium income could plausibly cover, and enough to seriously damage the business in a single event. This is a fundamentally different risk category from the diversified, independent failures the per-purchase pricing model assumes.

**Why this shouldn't happen if the rest of the system works as designed:** genuine opportunities have limited source stock (LEGO's own 5-per-customer cap is a real example), and dumping thousands of identical units into a resale market would crash the price through oversupply — which the market-depth check in Section 2 is specifically meant to catch before an opportunity is ever surfaced.

**Hard safeguards needed regardless:**

- **Per-user caps** on total guarantee-covered value per month, regardless of tier.
- **A hard cap on total guaranteed exposure per single opportunity/SKU across all users combined** — so even many different users each buying a few units of the same hot item can't add up to an uncapped platform-wide liability.
- **A dedicated reserve fund**, sized against worst-case concentration scenarios rather than average claim rate, ring-fenced from commission and premium revenue rather than counted as free profit.
- **A declining guarantee rate as quantity per item rises** across the user base — discouraging exactly the kind of concentrated bet that causes correlated failure.
- Eventually, for a mature business, **reinsuring the tail risk** with an actual underwriter beyond a set threshold rather than carrying unlimited exposure on the platform's own balance sheet.

---

## 9. Financial Projections

### 9.1 Running Costs by Scale

Three cost buckets, based on current (August 2026) pricing.

**AI compute** — a two-tier approach where a low-cost model (e.g. Claude Haiku, ~$1/$5 per million input/output tokens) screens large volumes of listings, and a stronger model (e.g. Claude Sonnet, ~$2/$10 per million tokens, rising to $3/$15 from Sept 2026) only deep-verifies shortlisted candidates.

**Data access — the real cost driver.** Retailer and marketplace sites actively block automated access (eBay's bot-detection page was hit directly during research for this plan). Reliable operation needs paid structured-data APIs or a proxy/scraping service: Keepa runs ~£25/month standard tier, ~£45+ for heavier API access; scraping APIs run roughly $0.75–1 per 1,000 fetches for easy sites, jumping to $2.50+/GB for proxy-backed access to defended sites like Amazon/eBay.

**Hosting** — small VPS/serverless plus domain at low scope, scaling to real infrastructure (live bidding, notifications, database) at higher user counts.

| Scope | Monthly cost |
|---|---|
| Starting (3–5 opportunities/day, few categories) | £45–70 |
| Scaling (20 opportunities/day, more retailer coverage) | £150–260, potentially £300–450+ with harder retailers |
| 10,000 users (~50 opportunities/day, real infrastructure) | £450–870 (tech/infra only — see caveats below) |

**Two costs sit outside these figures at any scale:** payment processing (roughly 2–3% of everything that moves through the platform) and human operations (support, fraud monitoring, affiliate management), which becomes a genuine necessity at meaningful user counts.

**The bigger gap: customer acquisition cost has never been priced into the infra numbers.** Getting to 10,000 real users for a niche fintech-adjacent product typically costs £5–30 per user depending on channel — **£50,000–300,000** in acquisition spend, dwarfing the monthly infra cost entirely. This is the real unknown at scale, not the tech bill.

### 9.2 Revenue at 100 Users

Built-up projections from assumptions, not a researched benchmark — treat as a model to pressure-test, not a forecast.

**Pure auction-fee model, cold start:** ~3–5 solid opportunities/day, thin bidding pushes average winning bids to only £5–8 → **£450–1,200/month**.

**Hybrid model (membership + auction fee):** £15–20/month access fee, ~70 of 100 users active payers, plus auction fees → **£1,800–2,600/month** total.

**More mature version:** 7–8 solid opportunities/day, stronger engagement pushing average winning bids to £10–12 → **£4,000–5,000/month**.

**Bonus:** affiliate commission on the LEGO example adds roughly £1.30–2.70 per completed purchase on top.

**Key strategic insight:** running costs barely move with user count — they're driven by how many listings are scanned, not how many people are logged in. Revenue is capped by deal flow, not user count. The real lever isn't "get more users," it's "find more good deals reliably."

**Scaling to 20 opportunities/day** roughly doubles-to-triples operational load. Cost: **£150–260/month** (potentially £300–450+). Revenue: membership unchanged at £1,050–1,400/month; auction fees on 600 opportunities/month range from £4,800–7,200/month (healthy demand) down to £2,400–3,600/month if supply outpaces the 100-user demand pool; affiliate adds £600–1,000/month. **Total: roughly £4,050–7,200/month.**

**Recommended starting volume: 3–5 opportunities/day, not 20** — it fits the £45–70/month cost tier, keeps real competitive bidding among only 100 users (the actual signal needed early on), and allows every opportunity to be manually sanity-checked before going live. Move to 8–10/day once multiple bidders per opportunity and healthy winning bids show demand outpacing supply; push toward 15–20/day only once the user base has grown well past 100 or harder-retailer coverage is built out to match.

### 9.3 Revenue at 10,000 Users

Two things change at this scale: opportunity volume needs to rise to **40–60/day** to keep 10,000 users engaged (past what pure scanning comfortably supports, pushing toward direct retailer partnerships), and the active/paying rate realistically drops to 20–25% from the 70% early-adopter assumption at 100 users.

**Revenue**, with 2,000–2,500 active paying users (flat single-price assumption, before tiering):

- Membership (£15–20/month): £30,000–50,000/month
- Auction fees on 1,500 opportunities/month, deeper bidder pool pushing average bids to £12–18: £18,000–27,000/month
- Affiliate commission: £2,000–2,500/month
- **Total: roughly £50,000–80,000/month**, against infra costs under £900/month — though the constraint at this scale is acquiring and retaining real users, not infrastructure.

### 9.4 Tiered Pricing Uplift

Modelled against the same 10,000-user base: 60% Free, 25% Standard, 12% Pro, 3% Elite.

2,500 × £15 + 1,200 × £40 + 300 × £85 ≈ **£111,000/month in membership revenue alone** — well above the £30,000–50,000/month a single flat price produces, because tiering captures real value from users willing to pay significantly more for sniper mode and early access.

Adding marketplace commission (Section 8.1) at an estimated 45% internal-marketplace adoption adds a further **£5,000–6,000/month**.

### 9.5 Tier Profitability: Pro vs Elite

**Per user, Elite is clearly more profitable.** Combining subscription fee, auction-fee share, and marketplace commission, rough per-tier revenue works out to **£17/user/month (Standard), £44/user/month (Pro), £89/user/month (Elite)** — Elite's higher subscription fee more than offsets its lower 5% commission rate.

**But Elite also costs more to serve.** Sniper mode monitoring, buyback guarantee exposure (now self-funding under the per-purchase model in Section 8.3, but still carrying some cost), and priority human support bring estimated cost-to-serve to roughly £1.50/user (Standard), £6–7 (Pro), £20–30 (Elite). Net profit per user: **£15.50 (Standard), £37 (Pro), £64 (Elite)**.

**In total contribution, Pro wins outright**, purely on volume: £37 × 1,200 Pro users ≈ **£45,000/month**, versus £64 × 300 Elite users ≈ **£19,000/month**. Ranking by total monthly profit: **Pro > Standard > Elite**.

**Making Elite the top contributor** requires either scale or better unit economics, ideally both:

- **Growth target:** roughly 550–700 Elite users (up from 300) would make it the top contributor at current or improved per-user economics — achievable by making the syndicate feature a self-recruiting growth engine, and explicitly nudging high-volume Standard/Pro users toward Elite.
- **Unit economics fix:** the per-purchase insurance model in Section 8.3 already improves this versus the old "bundled free" design, converting an open-ended cost into a self-funding, discounted line item.
- A modest price test toward £110–120/month for new Elite sign-ups (existing members grandfathered) is a low-risk way to test additional headroom, given power users are typically far less price-sensitive than casual users.

---

## 10. Logistics & Fulfilment

### 10.1 Domestic Courier Comparison

Independent reliability data (Trustpilot) tells a clear story: **DPD leads at 4.1/5**, Royal Mail sits mid-table at 3.2/5 (consistent with Ofcom's active investigation into Royal Mail's 2025/26 delivery performance — only 75.7% of First Class post arrived next-day against a 93% target, and over £37 million in fines to date for repeated failures), and Evri (1.5/5) and Yodel (1.3/5) are both notably worse despite being the cheapest.

| Courier | Domestic 2kg price | Trustpilot rating | Notes |
|---|---|---|---|
| Evri | ~£2.50–3.50 (small), ~£4.20 (2–5kg) | 1.5/5 | Cheapest, but "inconsistent service quality" |
| Royal Mail | ~£4.65 (2–5kg) | 3.2/5 | Mid-table; active Ofcom investigation into performance |
| DPD | ~£7.50 (2–5kg) | 4.1/5 | Best tracking (1-hour delivery windows), £100 default cover |
| Yodel | — | 1.3/5 | Avoid for anything of real value |
| Parcelforce | — | 2.8/5 | Best for heavy items (up to 30kg) or 9am time-critical delivery |

**Recommendation: DPD as the default** for anything mid-value where tracking and predictability matter, given the strongest independent reliability rating and best-in-class live tracking. Evri remains viable for low-value items where the cost saving outweighs the reliability risk.

**DPD affiliate programme:** runs via the Shopper.com network (dpdlocal-online.co.uk), paying 5–10% commission per referred booking, 1-month cookie. Note: searches for "DPD affiliate" mostly surface an unrelated digital-download company also called DPD — the correct signup is specifically for DPD Group's courier affiliate programme.

### 10.2 International Case Study: Japan vs Europe

A worked example, using the LEGO 42211 proof-of-concept set, testing whether cross-border resale (Section 6.3) actually clears a profit once real costs are included — not just the headline price gap.

**Japan.** Regional secondary-market data showed Japan at $175–183 (~£130–136) for this set — the highest of any region checked, comfortably above the UK's own £76–90 resale range. But once international shipping (£31–34 via Royal Mail International Tracked), eBay's ~16% combined fees, and Japan's 10% import consumption tax (charged to the buyer on delivery, but still determining what they'll actually pay) are factored in, the price a seller could realistically charge while staying competitive against Japan's own domestic resale price drops to around £86 for the item — netting only **£6–7 profit, about 12% margin**, actually worse than simply reselling domestically in the UK.

**Europe (Italy as the best of the region checked).** Shipping is far cheaper (£19.80 via Royal Mail to Italy vs £31.35 to Japan), but EU import VAT applies to all imports regardless of value (no de minimis threshold since 2021, plus a new flat €3 customs duty from July 2026) — and the rate itself is steep: Italy 22%, Germany 19%, Hungary 27%, Norway 25% (non-EU but similar rules), all well above Japan's 10%. Combined with a much smaller raw price premium in Europe for this specific item (£79–125 vs UK's own £76–90), the numbers come out **roughly break-even to a small loss** once VAT and shipping are included.

**The general lesson:** a good export destination needs three things simultaneously — a genuinely large price premium, a low destination import tax, and cheap shipping. Japan had a large premium but lost most of it to distance and its own tax; Europe has cheap, fast shipping but loses more to VAT than it saves. This needs to be computed **per opportunity**, not assumed for any single country — exactly the kind of check the AI matching engine should run automatically before ever suggesting a cross-border flip, rather than treating any one destination as reliably good.

**In practice, this makes cross-border a fallback, not a first option** — Section 11.7 sets out the waterfall: sell UK first, only reroute internationally if a UK sale genuinely fails and the real numbers above still clear a profit.

---

## 11. Operational Mechanics & Risk Controls

Working through how the marketplace actually behaves once opportunities, holds, and resale requests are moving at real volume — the operating rules the platform runs on, not just headline features.

### 11.1 Dynamic Action Clock ("Deal Heat")

The action clock (Section 2, step 5) scales with how volatile the opportunity is rather than staying fixed. A flat clock either wastes urgency on stable items or gives genuinely hot ones too much time to drift in price or sell out from under the platform.

Every opportunity gets an urgency tier derived from data already computed at the verification stage (Section 2, step 2) — how limited the source stock is, how thin the destination resale market is, and how much price volatility has been observed on the source listing:

- **Hot** (limited/flash clearance stock, thin resale depth): ~20–30 minute clock.
- **Standard** (typical retail clearance, healthy resale depth): ~45 minutes.
- **Stable** (evergreen items, deep stock both ends): up to 60 minutes.

This keeps the fastest-decaying opportunities moving before the underlying deal disappears, without unnecessarily rushing users on lower-risk items.

### 11.2 Batch Relisting & Market Depth Risk

When an opportunity's estimated market depth (Section 2, step 2) exceeds the per-customer purchase limit — the LEGO proof-of-concept in Section 4 is capped at 5 per customer against a much larger resale market — the platform does not mechanically relist batch after batch until the estimated ceiling is reached.

**The risk of blind relisting:** the "market can take 100 units" figure is an estimate, not a confirmed fact. Relisting on a fixed schedule regardless of real outcomes risks flooding the resale market faster than genuine demand can absorb it — crashing the very price the opportunity was priced against — running into real-world source stock or per-account purchase limits a static plan doesn't account for, and directly compounding the concentration risk already flagged in Section 8.4.

**The rule instead: gate each new batch on evidence, not a timer.** A second batch only opens once a minimum share of the previous batch shows confirmed sell-through — listed and moving at or near the AI's predicted price — within a defined window. No signal, no next batch, regardless of whether the estimated total ceiling has been reached, and regardless of the calendar (this replaces any notion of a fixed "offer more the next day" schedule). The hard per-opportunity exposure cap from Section 8.4 still applies on top as a backstop, regardless of how well batches appear to be selling.

### 11.3 Starting Bid & Instant-Win Pricing

**Starting bid is set as a percentage of expected margin, not a percentage of sale value.** Bidders are buying the right to capture the profit on an opportunity, not the item itself — pegging the starting bid to sale price would make thin-margin, high-value items look artificially expensive to bid on, and fat-margin, low-value items look artificially cheap. A starting bid of roughly 15–20% of expected margin, scaling up with the AI's confidence score, keeps every opportunity's entry cost proportional to the actual profit on offer.

**Instant-win price sits alongside the live auction, not instead of it.** Calculated the same way — off expected margin and confidence score — any bidder can pay this price to skip the live auction and win immediately, payment captured on the spot. This gives sniper-mode and high-conviction users a way to guarantee a deal instead of risking getting outbid, and gives the platform a second, independent revenue lever per opportunity.

### 11.4 Order Matching — Price-Time Priority

The internal marketplace (Section 8.1) shows pooled stock across all sellers for the same SKU and condition as a single listing, rather than duplicate listings per seller — closer to a real order book than a classifieds page. Fulfilment goes to **whichever seller has the lowest asking price first**, with listing time used only as a tiebreaker between sellers at an identical price — the same price-time priority rule real exchanges use for order matching. This rewards sellers willing to accept a thinner margin for a faster sale rather than simply whoever listed first, and it's one more place the "stock market for products" framing earns its keep rather than just being a tagline.

### 11.5 Trade & Wholesale Seller Channel

Bulk clearance stock from a distributor (a Screwfix-style example) doesn't fit the consumer subscription ladder in Section 7 — a distributor isn't consuming AI-discovered opportunities, they're supplying stock directly, so a separate account type is needed.

**Trade Seller account:** no monthly subscription, and a volume-tiered marketplace commission — e.g. 12% below a set monthly GMV threshold, stepping down toward 8% above it. This sits above Elite's 5% (Trade Sellers use none of the AI discovery, auction, or buyback machinery) but still comfortably undercuts general marketplace fees, making the platform an attractive outlet for guaranteed-demand bulk liquidation.

Beyond just accommodating the use case, this is a genuine second revenue channel — supply-side liquidity that doesn't depend on the AI finding enough organic opportunities fast enough, which matters most in the early months when deal volume is naturally thin (Section 9.2's recommended 3–5/day starting point).

### 11.6 Buyback Anti-Abuse Safeguards

The per-purchase buyback model (Section 8.3) prices real risk correctly, but pricing alone doesn't stop a claim being filed opportunistically — someone giving up after one lowball offer, rather than genuinely failing to sell. A buyback claim is only payable once:

- **The item has been actively listed for sale**, at or below the AI's original estimated resale price, for a minimum window — the same 14 days used elsewhere in this plan for consistency — with proof of the listing.
- **If still unsold after that window, a final 48–72 hour step:** the item must be offered at cost, either to the open market or back into Flipsta's own liquidation pool, before the claim is honoured.

That second step does double duty — it proves a genuine failure to sell rather than impatience, and it gives the platform first refusal to absorb the loss cheaply by buying at cost and moving the item through its own liquidation channel, which is typically cheaper than paying out the full guarantee.

### 11.7 Cross-Border Overflow Logic

Section 10.2 showed that cross-border resale (Japan, Europe) rarely clears meaningful margin once real shipping, customs, and VAT are included — so international selling is a fallback, not a default channel. The sequence: sell in the UK first; if unsold after the same 14-day window used in Section 11.6, the AI rechecks realistic EU/US net margin using the real cost model from Section 10.2; if genuinely positive, the listing is redirected internationally; if not, it falls through to the buyback/liquidation path in Section 11.6. One consistent sequence, rather than three features that don't talk to each other.

### 11.8 Limit-Sell Orders

Alongside selling immediately at the best available price (a market sell), a seller can set a minimum acceptable price or margin and let the item sit live until either matched or cancelled (a limit sell) — the same market-order-versus-limit-order distinction from real stock trading. This is a natural, on-brand feature for a "stock market for products," and low-complexity relative to the auction engine itself.

### 11.9 Courier Integration in the Seller Dashboard

One-click account connection for DPD and Evri inside the seller dashboard, pulling labels and rates via their APIs, with the AI suggesting which carrier to use per shipment based on item value — DPD by default for higher-value or time-critical items (Section 10.1's reliability data), Evri where the cost saving outweighs the reliability risk on low-value items.

### 11.10 Buyer Want Requests (Demand-Pull Sourcing)

Everything up to this point assumes the AI finds a deal first and then looks for a buyer — supply-push. A **Buyer Want** runs the other direction: a buyer posts exactly what they're after — item, size/condition, and the maximum price they're prepared to pay — as an open, visible request, and the sale is decided by a competitive bidding war on the sell side.

**How the bidding war works.** Any seller already holding matching stock can respond with an offer at or below the buyer's stated max. Other sellers can then undercut it, live and in the open — the same "watch it happen" energy as the social auction feed (Section 6.1), just running in reverse: sellers competing downward instead of buyers competing upward. Whoever has the lowest genuine offer when the window closes wins the sale, with time used only as a tiebreaker between identical offers — the same price-time priority rule as Section 11.4, applied to a reverse auction instead of a forward one.

**If nobody currently holds it,** the want becomes a standing sourcing target for the AI, using the same discovery engine as any other opportunity (Section 2, step 1) — except this one already has a guaranteed buyer and a known ceiling price, which is actually *lower* risk than a normal speculative find, since there's no market-depth guesswork on the sell side. Once sourced, it flows into the normal opportunity/auction pipeline as usual.

**Why this is worth building, not just accommodating:** it's a second demand signal feeding the AI's discovery engine directly from real buyer intent rather than only from scanned retailer prices, and it opens a second engagement loop — buyers watching a live reverse-auction for something they actually want, rather than only reacting to whatever the AI happens to surface.

---

## 12. Platform Operations, Trust & Compliance

The mechanics in Section 11 govern how a deal moves through the platform. This section covers what's needed to run the *business* behind it day to day — internal tooling, partner relationships, trust signals, and legal/tax obligations that exist regardless of transaction volume.

### 12.1 Ultimate Admin Dashboard & Ticketing System

A staff-only application, separate from every seller/buyer-facing surface, built around three jobs:

**Platform overview.** Live GMV, active auction count, total escrow balance currently held, blended take rate, seller counts by tier, and open ticket/dispute count — the single screen a founder or ops lead checks first each day.

**Seller management.** Search and filter every seller account; drill into an individual seller's tier, strike history, buyback claim history, listing and order history, and verification status; suspend, ban, or manually override a seller's tier with a logged reason. This is also where the concentration-risk flags from Section 8.4 and the batch-relisting gates from Section 11.2 surface for a human to review, not just enforce silently.

**Ticket-based support and dispute resolution.** Every support interaction — payment disputes, buyback claims, "item not as described" reports, courier issues, account/verification problems — becomes a ticket with a category, priority, assigned staff member, an SLA timer, and a status (open / in progress / waiting on user / resolved). Staff-only internal notes stay separate from anything the user sees. Canned responses cover the categories that repeat at volume (buyback proof-of-listing requests, standard courier delay responses). Tickets are the *only* buyer↔seller contact channel for disputes — this deliberately keeps the blind-teaser protection from Section 5 intact rather than letting direct messaging become a way to route around it.

**Fraud and risk monitoring.** A dedicated view surfacing buyback-abuse pattern flags (Section 11.6), unusual bidding behaviour (coordinated sniping, wash-trading style self-dealing), and sellers approaching the concentration caps (Section 8.4) — the alerts the batch-relisting and buyback logic already generate, aggregated somewhere a human actually sees them.

**Audit log.** Every admin action (tier override, ban, manual refund, ticket resolution) is logged with who, when, and why — standard practice for a platform handling other people's money, and useful the first time a decision gets questioned.

Role-based access from day one: junior support staff can work tickets and view seller history; only senior staff can issue refunds, override tiers, or ban an account.

### 12.2 Supplier & Courier Partner Programme

Two related but distinct partner types, worth keeping separate in the data model even though they share one admin screen:

**Supplier/distributor partners** — the Trade & Wholesale Seller channel from Section 11.5. New applicants go through an approval workflow (application → review → approved/rejected), get a custom commission rate reflecting their volume tier, and have their contract terms recorded against their account. This is commission the platform *charges*.

**Courier affiliate partners** — DPD (via the Shopper.com affiliate network, already flagged in the infrastructure checklist) and Evri's equivalent programme, plus room for others later. This tracks referred shipping volume against an affiliate code and reconciles payouts the platform *receives* from the courier, which is the opposite direction of the supplier relationship above.

Practically, one `partners` admin table with a type field (supplier / courier), a status field (pending / active / suspended), and a commission-or-affiliate-code field covers both without over-building — adding a new partner is then just filling in a form, not an engineering task.

### 12.3 Global Design Convention — Header & Navigation

Locked in as a platform-wide rule rather than a per-page choice: every page — consumer marketplace, and all three reseller dashboard tiers — uses a header with the logo on the left, a **centered search bar**, and account/notifications/cart icons on the right, with a horizontal **tab bar directly underneath** for section navigation (Shop / Opportunities / Buyer Wants / My Orders on the consumer side; Dashboard / Live Opportunities / Buyer Wants / Marketplace / Portfolio / Wallet on the reseller side). Defining it once here, rather than per-mockup, is what makes it mechanical to apply consistently as more pages get built.

### 12.4 Reviews & Seller Ratings

A buyer can leave a rating and short review on a seller only after a verified, completed order — preventing review manipulation and giving every seller a visible trust score before a buyer bids or buys. This feeds two things beyond the storefront: it's an additional signal into the fraud/risk monitoring in 12.1 (a sudden rating drop is worth a human look), and over time it's a natural input into tier-review decisions alongside the existing performance criteria.

### 12.5 Notifications

Not yet wired into the codebase, and worth treating as a first-class feature rather than an afterthought. Email at minimum, from launch: auction win/outbid alerts, buyback claim status changes, ticket updates, and order status changes. In-app and push notifications are a natural later addition once there's a mobile-weighted user base, but email alone covers every time-sensitive case (especially action-clock and buyback windows) from day one.

### 12.6 Seller Tax Reporting & HMRC Digital Platform Reporting

This is a genuine UK legal obligation, not an optional nice-to-have, and it sits on top of (not instead of) sellers' own responsibility for their own tax affairs. Since January 2024, UK digital platforms — under HMRC's Reporting Rules for Digital Platforms, based on the OECD's Model Rules — must collect and verify identifying information from sellers using the platform (name, address, date of birth, tax reference/National Insurance number or company number, and bank account details) and report qualifying sellers' income to HMRC annually, with the report due by 31 January following the end of the reporting year. There's a de minimis exclusion for very low-volume sellers (broadly, under 30 sales *and* under roughly €2,000 in the year), but Flipsta should assume most active resellers on the platform will cross that threshold and be reportable.

**What this means practically:** seller onboarding needs a verification step to collect and confirm this information before a seller can list (this can piggyback on the identity checks Stripe Connect Express already requires for payouts, reducing duplicate friction), the platform needs to retain this data securely for the required period, and an annual reporting process (or dedicated software) needs to be in place before the first live reporting year Flipsta sellers are active in. This is worth raising directly with an accountant alongside the FCA point already flagged in Section 13, since getting the seller-onboarding data model right from the start is much cheaper than retrofitting it once sellers are already live.

*(Current UK guidance: [gov.uk — Collect and verify digital platform seller information](https://www.gov.uk/guidance/collect-and-verify-digital-platform-seller-information); plain-English summary: [Low Incomes Tax Reform Group — Digital platform reporting rules](https://www.litrg.org.uk/working/gig-economy/digital-platform-reporting-rules). Confirm current thresholds and deadlines directly before this becomes load-bearing — these figures are correct as of this document's last update but HMRC guidance is periodically revised.)*

### 12.7 Legal Documentation

A first-draft Terms & Conditions has been produced as a companion document (`flipsta-terms-and-conditions-draft`) covering platform use, the auction/bidding mechanic, the buyback guarantee, seller obligations (including the tax reporting duty in 12.6), prohibited items, dispute handling via the ticketing system in 12.1, liability limits, and governing law. It is explicitly a starting placeholder, not a finished legal document — it still needs review by a UK solicitor (the same review already flagged in Section 13 for the short-selling exchange model) before it's published live, and it needs a matching Privacy Policy, Cookie Policy, and Seller Agreement written alongside it, none of which exist yet.

---

## 13. Starting Recommendation & Roadmap

Build Version 2 first, starting at **3–5 verified opportunities/day** — it proves the AI matching engine finds real, reliable margin (as the LEGO example demonstrates), with none of Version 1's regulatory weight, running costs of roughly £45–70/month at that starting scope, and the teaser/binding-payment structure in Section 5 protecting each opportunity before it's paid for.

Scale opportunity volume only as bidding activity shows demand outpacing supply (Section 9.2). Layer in the differentiators from Section 6 once the core mechanic is proven — the referral loop and buyback guarantee are worth pulling forward early, since they address the two weakest points in the model (thin early liquidity, and bidder hesitation).

Use DPD as the default courier from day one (Section 10.1), price the buyback guarantee per-purchase from launch rather than retrofitting it later (Section 8.3), and treat international sourcing/selling (Sections 6.3, 10.2) as a deliberate later expansion once the per-opportunity cost/benefit can actually be computed with real data, not assumed.

The operational rules in Section 11 — batch-gated relisting, price-time order matching, and the buyback anti-abuse window especially — are worth building into the core system from day one rather than retrofitted, since they're risk controls, not polish.

Version 1 is the bigger swing, worth keeping on the roadmap once there's real trading volume, trusted data, and proper UK regulatory advice in place.
