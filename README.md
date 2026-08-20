# Flipsta — platform codebase

This is the real, database-backed implementation of the business model in
`planning/exchange-concept-explainer.md` — not another mockup. Read
**STATUS.md** first: it's an honest account of what's fully working, what's
stubbed, and one open design question worth confirming before this handles
real money.

## Repo layout

```
apps/web/       Next.js app — the site itself (App Router, TypeScript, Tailwind),
                 real auth (sign-up/login/password reset), a tier-aware
                 /dashboard, /portfolio, /wallet, and the staff-only /admin
                 dashboard (Section 12.1).
apps/worker/     Background service — the AI discovery pipeline (with a real,
                 pluggable Claude scoring step), auction closer, batch-relist
                 evaluator, escrow release sweep (now writes real wallet
                 transactions), the risk/fraud flag sweep, and the
                 cross-posting retry sweep (Section 12.1 / 7).
packages/shared/ Business logic used by both: pricing formulas, order
                 matching, tier entitlements, ticket SLAs, HMRC reportable-
                 seller check, AI listing pre-fill. Fully unit tested (39 tests).
supabase/        SQL schema (5 migrations, run in order — see below) + seed data.
legal/           Draft Terms & Conditions (Section 12.7) — not solicitor-reviewed, see the file itself.
mockups/         The signed-off HTML mockups (Pro/Standard/Elite/consumer/admin) the real UI is built against.
render.yaml      Deploy blueprint for Render (web service + worker service).
.github/         CI: typecheck, test, build on every push/PR.
```

Every non-trivial function is commented with which section of the business
doc it implements, so the code and the plan stay traceable to each other.

## Run it locally

1. `npm install` (root — this is an npm workspaces monorepo, one install covers everything)
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and `apps/worker/.env.example` to `apps/worker/.env.local`, and fill in your Supabase project's URL/keys (see `INFRASTRUCTURE_TODO.md` — none of this runs against real data until that's done)
3. Run every migration against your Supabase project, **in order**: `0001_init.sql`, `0002_admin_ops.sql`, `0003_cross_posting.sql`, `0004_auth_profile_trigger.sql`, `0005_seller_order_visibility.sql`, then `supabase/seed.sql` for sample data
4. `npm run dev:web` — the site at localhost:3000. Sign up at `/signup` (in Supabase Auth settings, consider disabling "Confirm email" for local testing so you don't need a real inbox)
5. To reach the admin dashboard, manually set your profile's `role` column to `'admin'` in the Supabase table editor after signing up — there's no self-service way to become staff, deliberately
6. `npm run dev:worker` — the background jobs, in a separate terminal. Set `ANTHROPIC_API_KEY` here to turn on real AI scoring for newly discovered deals (see STATUS.md)
7. `npm test` — the business-logic test suite (runs without any of the above — no external services needed)

## What actually works right now

- **Real sign-up, sign-in, and self-serve password reset** (`/signup`,
  `/login`, `/forgot-password`, `/reset-password`) — no admin needed to
  create or recover an account.
- **A real, tier-aware dashboard** (`/dashboard`, `/portfolio`, `/wallet`) —
  a user can see their wins, listings, sales, purchases, and a real
  transaction ledger (written by the worker the moment escrow releases),
  entirely self-serve.
- The full auction mechanic: opportunities, bidding, instant-win, action
  clocks that vary by urgency tier, all against a real Postgres schema.
- Buyer Wants reverse auction, ranked correctly (lowest genuine offer wins).
- The marketplace's pooled order book (price-time priority) — real listings, real sorting.
- Tiered marketplace commission calculated correctly per seller's subscription.
- The buyback guarantee's per-purchase pricing formula, with the anti-abuse
  eligibility check from Section 11.6.
- A Stripe Connect escrow layer (works in a stubbed "no real keys yet" mode
  out of the box, so checkout is exercisable before Stripe is even connected).
- A discovery worker that actually inserts live opportunities on a schedule,
  using a mock data source so it's demonstrable without a paid API key.
- **A real, pluggable AI scoring step (Section 9.1)** — set `ANTHROPIC_API_KEY`
  on the worker and every newly discovered deal is scored by a real Claude
  call instead of the margin/volatility heuristic; falls back automatically
  with no key set or if the call fails.
- **Multi-platform listing (Section 7)** at `/sell/new` — AI-prefilled
  title/price from a won opportunity, a real auto cross-post switch to
  eBay/Amazon/Vinted/Facebook Marketplace/Depop, a real per-channel DB
  record, and a worker retry sweep. The actual external post is stubbed
  until each platform's API credentials exist (see INFRASTRUCTURE_TODO.md).
- **The admin dashboard (Section 12.1)** at `/admin` — real seller list with
  tier override/suspend, a real ticket queue with SLA breach detection and
  internal notes, supplier/courier partner management (Section 12.2), a
  risk & fraud queue fed by a real worker job, and an audit log of every
  admin action. Gated server-side on `profiles.role`, not just hidden in the UI.
- **Self-serve partner sign-up (Section 12.2)** at `/partners/apply` — a
  supplier or courier applies with no account needed; it lands as `pending`
  in the same admin Partners queue.
- **Reviews & ratings (Section 12.4)** — a buyer can rate a seller only
  after their order shows `delivered`, enforced in the API, not just RLS.
- **A real notifications layer (Section 12.5)** — stubs to the console
  without a Resend key set, sends for real once one is; wired into ticket
  status changes as the first real call site.
- **The global header convention (Section 12.3)** — centered search bar,
  tabs underneath — applied to the real site's layout, not just the mockups.
- **Seller tax-reporting schema (Section 12.6)** — `seller_tax_info` table
  and an `isHmrcReportableSeller()` helper matching current HMRC digital
  platform reporting guidance; the actual onboarding UI to collect this
  still needs building (see STATUS.md).

See `STATUS.md` for what's intentionally left as a clearly-labelled stub.
