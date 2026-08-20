# Status — what's real, what's stubbed, what needs a decision

Written straight, not as a sales pitch. A platform at the scale you're
describing is a multi-month engineering effort for a real team — this is a
solid, correct, tested foundation, not a finished eBay competitor. Here's
exactly where that line sits.

## Fully implemented and tested

- **All core pricing/matching logic** — starting bid, instant-win price,
  buyback premium (matches the doc's worked examples exactly), urgency-tier
  action clocks, marketplace commission tiers, price-time order matching,
  buyer-want reverse-auction ranking, batch-relist sell-through gating,
  buyback anti-abuse eligibility, ticket SLA windows, HMRC reportable-seller
  check, AI listing pre-fill. 39 unit tests, all passing, across
  `packages/shared` and `apps/worker`.
- **Real database schema** — every entity from the business doc modelled in
  Postgres with Row Level Security, across `supabase/migrations/0001_init.sql`
  (core marketplace), `0002_admin_ops.sql` (admin/tickets/partners/reviews/
  risk/audit/tax), `0003_cross_posting.sql` (multi-platform listing),
  `0004_auth_profile_trigger.sql` (auto-creates a profile on signup), and
  `0005_seller_order_visibility.sql` (lets a seller see orders on their own
  listings, not just buyers see their own).
- **Real sign-up, sign-in, and self-serve password reset** — `/signup`,
  `/login`, `/forgot-password`, `/reset-password`, all using Supabase Auth
  directly, no admin involvement. This closes a real gap: previously nothing
  in the codebase created a `profiles` row for a new user at all, so a
  signed-up user would have been silently treated as signed out everywhere.
- **A real, tier-aware dashboard** at `/dashboard`, plus `/portfolio` (won
  opportunities, listings with live cross-post status, sales, and purchases)
  and `/wallet` (a real transaction ledger, not a mock) — Section 12.1's
  "self serving on all dashboards" made real. `/dashboard` is one unified
  page whose feature list is driven by the same `TIER_ENTITLEMENTS` map
  every API route enforces, rather than three separate pixel-matched
  Standard/Pro/Elite pages (see "Deliberately stubbed" below).
- **A real, pluggable AI element (Section 9.1)** — `apps/worker/src/aiScoring.ts`
  calls Claude (Haiku) to score each discovered deal's confidence and write
  real reasoning text, the moment `ANTHROPIC_API_KEY` is set. Falls back to
  the existing margin/volatility heuristic with no key set, or if the AI
  call itself fails — discovery never goes down because of it.
- **Working API layer** for the core flows: browse opportunities (with
  correct redaction + tier-gated early access + AI-explainability gating),
  bid, instant-win, post/offer on Buyer Wants, browse the pooled marketplace
  order book, checkout (creates a real order + Stripe PaymentIntent).
- **The admin dashboard (Section 12.1)**, real and staff-gated server-side
  (not just hidden in the UI) — seller search/tier-override/suspend, a
  ticket queue with computed SLA-breach detection and internal notes,
  partner approval, a risk & fraud queue, and a full audit log. Every
  mutating admin route writes to `admin_audit_log`.
- **Supplier & courier partners (Section 12.2)** — a real `partners` table,
  an admin approval flow, and a public self-serve application form at
  `/partners/apply` that lands as `pending` for admin review — no engineering
  needed to onboard a new partner, just an approval click.
- **Multi-platform listing (Section 7)** — `/sell/new` lets a Pro/Elite
  seller turn a won opportunity into a listing with AI-suggested title/price,
  flip an auto cross-post switch, and tick eBay/Amazon/Vinted/Facebook
  Marketplace/Depop. Publishing is a clearly-labelled stub (see "Deliberately
  stubbed" below) but the whole flow — submit, synchronous attempt, DB
  record per channel, worker retry sweep — is real and tested.
- **Reviews & seller ratings (Section 12.4)** — gated on the buyer actually
  owning a `delivered` order for that seller, one review per order.
- **A real notifications layer (Section 12.5)** — stubs to the console
  without a Resend key, sends for real once one is set; wired into ticket
  status changes.
- **The global header convention (Section 12.3)** — centered search, tabs
  underneath — is the real site's layout now, not just the mockups.
- **A real background worker** that runs discovery, closes expired auctions,
  evaluates batch relisting, sweeps for escrow release, flags risk/fraud
  signals, and retries cross-posting — on a schedule, against the real
  database, not a simulation.
- **Escrow payment layer** — works today in a stubbed "no live Stripe keys"
  mode so the whole checkout flow is testable before you've even created a
  Stripe account, and switches to real Stripe Connect calls the moment
  `STRIPE_SECRET_KEY` is set.
- Full build, typecheck, and test suite all pass — verified in this session,
  not just written and assumed to work.

## Deliberately stubbed (clearly labelled in the code, not hidden)

- **AI discovery source** — `mockAdapter.ts` generates plausible fake deals
  so the pipeline runs end to end. `keepaAdapter.ts` is a scaffolded stub
  that throws until you add a Keepa key and fill in the real API calls. The
  AI *scoring* step is real (see above) — it's finding real deals in the
  first place that still needs Keepa.
- **AI scoring is single-tier, not the doc's two-tier design** — one Haiku
  call per candidate today, where Section 9.1 describes a cheap model
  screening volume and a stronger model deep-verifying shortlisted
  candidates. Worth splitting once real deal volume makes the cost worth
  optimising.
- **Cross-posting to eBay/Amazon/Vinted/Facebook Marketplace/Depop** —
  `packages/shared/src/salesChannels.ts: publishListingToChannel()` simulates
  a successful post. Every one of those platforms needs its own
  developer/seller API account and OAuth credentials before this can make a
  real call — see INFRASTRUCTURE_TODO.md's new cross-posting entry. The
  toggle, the per-channel DB rows, and the worker retry sweep are all real;
  only the actual HTTP call out to each platform is stubbed.
- **AI listing pre-fill** — `suggestListingFromOpportunity()` derives a
  title from category + source tier and a price of cost + full expected
  margin. It's a real, tested function, but a genuinely better title would
  need the actual product name captured during discovery (Section 2 step 1),
  which the mock adapter doesn't currently produce.
- **Frontend pages** — real, working pages exist for `/opportunities`,
  `/shop`, `/wants`, `/sell/new`, `/partners/apply`, `/dashboard`,
  `/portfolio`, `/wallet`, auth (`/signup`, `/login`, `/forgot-password`,
  `/reset-password`), and the full `/admin` suite, all wired to real data,
  deliberately kept simple rather than pixel-matched to the HTML mockups.
  The distinct Standard/Pro/Elite *visual* treatments from the mockups
  (colour accents, locked-feature upsell toasts, the syndicate widget) still
  aren't ported — `/dashboard` shows the same tier-driven feature list to
  everyone rather than three differently-skinned pages. The design system
  (colours, spacing) is already in `tailwind.config.ts` to make that
  translation mechanical rather than a redesign, if/when it's worth the
  engineering time versus the unified page.
- **Syndicates, Trade Sellers** — have a place in the schema
  (`trade_sellers`, `syndicates` tables) but no API routes or UI yet.
- **Real courier integration** — `orders.courier` is just a string today;
  no DPD/Evri API calls happen anywhere yet (see INFRASTRUCTURE_TODO.md #7).
- **Seller tax reporting (Section 12.6)** — `seller_tax_info` table and
  `isHmrcReportableSeller()` exist and are tested, but there's no onboarding
  UI yet to actually collect a seller's legal name/address/tax reference —
  worth building before real sellers are live, since it's a legal
  requirement, not a nice-to-have.

## One open design question — worth confirming before this touches real money

The business doc describes the auction mechanic two slightly different ways
in two places: Section 11.3 implies a genuine multi-round ascending auction
("instant-win sits *alongside* the live auction, not instead of it"), while
Section 3.2's worked example reads more like first-bid-wins ("a subscriber
grabs it... gaining exclusive rights"). This build picked the ascending-auction
interpretation — a fixed action-clock window per opportunity, highest bid
when it expires wins (see the comment in
`apps/worker/src/jobs/closeExpiredAuctions.ts`) — because it's the more
robust design and matches the "sniper mode is meaningfully different from
instant-win" framing elsewhere in the doc. Worth explicitly confirming
that's what you actually want before it's load-bearing for real transactions.

## Suggested next engineering steps, in order

1. Work through INFRASTRUCTURE_TODO.md #1-2 (GitHub + Supabase) so there's a
   real database to test sign-up/login against, then manually set one
   profile's `role` to `'admin'` to reach `/admin`.
2. Set `ANTHROPIC_API_KEY` on the worker to turn on real AI scoring — the
   single highest-leverage env var in this codebase for demo purposes.
3. Build a tier-upgrade flow (Stripe Checkout for the subscription itself,
   separate from the Connect/escrow payment flow) — right now `subscription_tier`
   can only be changed by an admin via `/admin/sellers`.
4. If the unified `/dashboard` isn't differentiated enough, port the three
   mockups' distinct visual treatments into it — the design tokens are
   already in `tailwind.config.ts`.
5. Build the seller tax-info onboarding form against `seller_tax_info`.
6. Wire a real courier (or Shippo/EasyPost aggregator), then real
   eBay/Amazon/Vinted/Facebook/Depop API credentials for cross-posting.
7. Replace the mock discovery adapter with Keepa once that account exists.
