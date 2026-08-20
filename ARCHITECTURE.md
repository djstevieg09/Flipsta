# Architecture

## Why this stack

You already run GitHub, Render, and Supabase — this is built to fit that
exactly, not to introduce new accounts you didn't ask for.

- **Next.js on Render** — one Node web service, App Router for both pages
  and API routes in one deployable unit. Render autoscales this
  horizontally (multiple stateless instances behind their load balancer) —
  no session state lives in the process, it's all in Postgres/cookies, so
  that scaling is free.
- **Supabase (Postgres + Auth + Realtime)** — schema in `supabase/migrations`,
  Row Level Security for data ownership, built-in connection pooling
  (PgBouncer) which matters a lot once you have more concurrent web/worker
  instances than Postgres' raw connection limit.
- **A separate worker service** — the AI discovery pipeline, auction-closing
  sweep, batch-relist evaluator, and escrow release run as their own Render
  background worker, not inside the web app's request path. This means a
  slow scan of retailer prices never blocks a page load, and you can scale
  the worker's resources independently of the web tier.
- **Stripe Connect** — the standard way marketplaces (Vinted, Etsy, Depop)
  handle buyer-seller money movement. Manual-capture PaymentIntents give you
  the escrow behaviour Section 6 asked for (funds held until delivery)
  without building payment infrastructure from scratch.

## How the mechanics map to code

| Business doc section | Implementation |
|---|---|
| 2 — Theory of Operation | `apps/worker/src/jobs/discoverOpportunities.ts` (discovery → verification → packaging), `apps/web/app/api/opportunities/route.ts` (distribution, redaction) |
| 5 — Blind Teaser | Field redaction in `GET /api/opportunities`, binding payment on bid/instant-win |
| 8.1 — Marketplace Commission | `packages/shared/src/pricing.ts: getMarketplaceCommissionRate` |
| 8.3 — Buyback pricing formula | `packages/shared/src/pricing.ts: calculateBuybackPremium` (unit tested against the doc's worked examples) |
| 8.4 — Concentration risk caps | `packages/shared/src/constants.ts: CONCENTRATION_CAPS`, enforced in `evaluateBatchRelisting.ts` |
| 11.1 — Dynamic action clock | `packages/shared/src/pricing.ts: classifyUrgencyTier / actionClockSeconds` |
| 11.2 — Batch relisting | `packages/shared/src/relisting.ts`, `apps/worker/src/jobs/evaluateBatchRelisting.ts` |
| 11.3 — Starting bid / instant-win pricing | `packages/shared/src/pricing.ts` |
| 11.4 — Price-time priority order matching | `packages/shared/src/orderMatching.ts` |
| 11.5 — Trade Seller channel | `supabase/migrations/0001_init.sql: trade_sellers` table (schema only — see STATUS.md) |
| 11.6 — Buyback anti-abuse | `packages/shared/src/pricing.ts: isBuybackClaimEligible` |
| 11.10 — Buyer Wants reverse auction | `packages/shared/src/orderMatching.ts: rankWantOffers` |
| 7 — Multi-platform listing | `packages/shared/src/salesChannels.ts`, `apps/web/app/sell/new`, `apps/web/app/api/listings/route.ts` (POST), `apps/worker/src/jobs/crossPostListings.ts` |
| 12.1 — Admin dashboard & ticketing | `apps/web/app/admin/*`, `apps/web/app/api/admin/*`, `apps/web/lib/adminGuard.ts`, `apps/web/lib/adminAudit.ts`, `apps/worker/src/jobs/flagRiskSignals.ts` |
| 12.2 — Supplier & courier partners | `supabase/migrations/0002_admin_ops.sql: partners`, `apps/web/app/api/admin/partners`, public apply flow at `apps/web/app/partners/apply` + `apps/web/app/api/partners/apply` |
| 12.3 — Global header convention | `apps/web/app/layout.tsx` (centered search, tabs underneath) |
| 12.4 — Reviews & seller ratings | `apps/web/app/api/reviews/route.ts`, `packages/shared/src/reviews.ts` |
| 12.5 — Notifications | `apps/web/lib/notifications.ts` |
| 12.6 — Seller tax reporting | `supabase/migrations/0002_admin_ops.sql: seller_tax_info`, `packages/shared/src/tax.ts: isHmrcReportableSeller` |
| 9.1 — AI confidence scoring | `apps/worker/src/aiScoring.ts` (real Claude call, gated on `ANTHROPIC_API_KEY`), `apps/worker/src/scoring.ts` (heuristic fallback) |
| Auth / account recovery | `apps/web/app/signup`, `/login`, `/forgot-password`, `/reset-password`, `supabase/migrations/0004_auth_profile_trigger.sql` |
| 12.1 — Self-serve dashboard | `apps/web/app/dashboard`, `/portfolio`, `/wallet`, `apps/web/app/api/wallet`, `apps/web/app/api/orders` (GET), `supabase/migrations/0005_seller_order_visibility.sql` |

## Scaling path — what "could get as big as Amazon or eBay" actually requires

Nothing here needs to be built today. This is the order things typically
stop being "good enough" as real traffic arrives, so you know what to reach
for and roughly when, instead of over-building on day one.

1. **Read replicas + connection pooling.** Supabase gives you PgBouncer
   pooling from day one; a dedicated read replica for reporting/search
   queries is the next lever once the primary starts showing write
   contention — a Supabase plan upgrade, not a rebuild.
2. **A real job queue.** The worker currently runs jobs on plain
   `setInterval` loops — simple, and completely fine at launch volume.
   Once opportunity/order volume is high enough that jobs start queuing up
   behind each other, move to `pg-boss` (Postgres-backed, no new
   infrastructure) and later Redis-backed `BullMQ` if throughput demands it.
3. **Caching / hot-data layer.** The live opportunity feed and the
   marketplace order book are read far more than written at scale — this is
   exactly what Redis (Upstash's serverless Redis is a good Render-adjacent
   fit) is for: cache the sorted order book, invalidate on write.
4. **Real-time fan-out.** Supabase Realtime (Postgres change streams) is
   fine up to a moderate number of concurrent connections. At genuine
   eBay-scale concurrent live-bidding, that needs a dedicated pub/sub +
   WebSocket fan-out layer — Redis pub/sub behind your own small service, or
   a managed option (Ably, Pusher).
5. **Search.** Postgres full-text search (already indexable on the
   `products`/`opportunities` tables) covers the catalogue for a long time.
   Once product count and query complexity grow, Meilisearch (self-hostable,
   cheap) or Algolia (managed, pricier) is the standard next step.
6. **Object storage + CDN for images.** Not yet wired in this scaffold (no
   real product photos exist yet — see the consumer marketplace mockup's
   icon-only approach). Supabase Storage works fine early; Cloudflare R2 +
   a CDN in front is the cheaper path at real volume, since R2 has no
   egress fees.
7. **CDN / WAF / bot protection in front of everything.** Cloudflare (free
   tier to start) in front of the Render web service — this matters a lot
   earlier than most of the above, since Section 4's proof-of-concept
   research already hit real bot-detection from eBay just doing manual
   price checks; a live marketplace will attract scraping and credential
   stuffing from day one, not just at scale.
8. **Observability.** Sentry for error tracking, a log aggregator (Render's
   own logs are fine at first, Better Stack/Logtail once you need retention
   and search). Set this up *before* you need it, not after an incident.
9. **Database backups + point-in-time recovery.** Supabase's paid tiers
   include this — worth upgrading to before real user money is flowing
   through the escrow tables, not after.

None of this blocks launch. It's the order to reach for each thing, written
down now so a future session (or another engineer) doesn't have to
re-derive it.
