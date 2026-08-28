# Flipsta — what's actually live vs. what's still sitting undelivered

Updated 27 Aug 2026 (night) — #-14 below is newly delivered, not yet confirmed applied by Steven. #-13, #-12 and #-11 are also still unconfirmed (see the packaging note just below — make sure Steven applied the final combined zip from that evening, not an earlier partial one). #-10, #-9, #-7 and #-8 are also still unconfirmed. The engagement round (#-5) and recommendations (#-6) are confirmed applied.

**A note on how #-11/#-12/#-13 were packaged**: these went out as several small zips as each fix was found live, one after another, in the same evening — and Steven's first upload attempt only included some of them, causing a real Render build failure (`channelOAuth.ts` referencing `etsy` on a `SalesChannelKey` union that `salesChannels.ts` hadn't been updated to include, because that file's zip wasn't part of what got uploaded). Fixed by re-packaging everything from #-11/#-12/#-13 into one consolidated `flipsta-final-upload.zip`, rebuilt and verified against a real fresh clone one more time before re-sending. If Steven mentions a build failure referencing `channelOAuth.ts` or `salesChannels.ts`, this is almost certainly why — confirm he applied the *final* combined zip, not one of the earlier partial ones.

## Delivered, not yet confirmed applied

### -14. Live selling (video shopping shows), free-month subscription grants, a public profit leaderboard, and a genuine net-ROI discovery floor

27 Aug 2026, Steven: "i would like to be able to offer my resellers the oppotunity to do live selling via my site. a bit like QVC, have the items show up when they are selling items for the viewers to buy the items, i think whatnot does this already so would be a good feature to have. I know we have the credit wallet. We also need an oppotunity to issue a free months subscription or mulitples of. When live oppotunities are available i think the minimum ROI should be 15% after all costs are taken into consideration. When someone signs up as a reseller it would be good to have a leaderboard showing who is the top seller by profit on the site, Top 10 is good enough. Please look at the other selling sites and have a look to see if there is something i have missed." Four features bundled into one round; scoped via four clarifying questions before any code was written — confirmed answers: **real video streaming** (not a virtual/chat-only event), **any approved reseller** can host, the free-month tool is a **general admin gifting tool** (not tied to a specific live-show giveaway mechanic), and the leaderboard is **fully public with exact profit** (visible even pre-signup).

**Live selling.** New `/live` (browse — live now / upcoming / recently ended), `/live/new` (schedule a show + queue items from your own unsold listings), `/live/[id]` (the show itself — video, item queue with live bidding + a buy-now escape hatch, host controls, live chat). Video is **Cloudflare Stream** — researched against Whatnot/eBay Live/TikTok Shop Live/Amazon Live/QVC/CommentSold/Bambuser/Firework/Channelize.io first; chosen specifically because it's the one mainstream option that supports a host broadcasting straight from their own browser (WHIP — no OBS or other software to install) alongside a simple hosted-iframe viewer player. Each item runs a short, fixed-length ascending auction (`LIVE_SHOW_ITEM_AUCTION_SECONDS`, currently 2 minutes — tune this one constant later if it needs to change), same "whoever's highest when the clock runs out wins" mechanic as the existing opportunities auction, for consistency. A winning bid (or a buy-now) creates a REAL order through the exact same checkout path as any other Flipsta purchase — see below.

**Order-creation was extracted, not duplicated.** `api/orders/route.ts`'s checkout logic now lives in `lib/orderCreation.ts` (`createOrderForListing()`), used by both a normal marketplace purchase and a live-show win/buy-now — same commission calc, same Stripe escrow PaymentIntent, same loyalty-credit award, same listing.sold_at update. A live-show item's auction settling when its clock runs out is handled by a new worker job (`closeExpiredLiveItems.ts`) which calls a new, shared-secret-authenticated internal route on the web app (`/api/internal/live-shows/settle-item`) to actually create the order — this keeps the Stripe SDK living in exactly one place (the web app), which is a design principle `releaseEscrow.ts`'s own comments already named but never actually built until now. Needs `INTERNAL_API_SECRET` set to the same value on both Render services — see `INFRASTRUCTURE_TODO.md` #13.

**Two real, pre-existing bugs found and fixed while doing this extraction (migration `0028_orders_rls_gaps.sql`)** — worth reading closely:
1. `listings` has **never** had an RLS UPDATE policy. Every real purchase's `sold_at` update has been silently rejected by Postgres since launch (same root-cause class as the Instant Win bug fixed in migration `0011` — an unchecked write silently affecting zero rows) — meaning a sold marketplace listing may never have actually been marked sold, and could in theory still show as available. Fixed with a narrowly-scoped policy (can only flip an unsold row to sold, one-directional).
2. `wallet_transactions` has **never** had an RLS INSERT policy for the one code path that uses the buyer's own (non-service-role) client — `lib/loyalty.ts`'s `awardLoyaltyCredit`, called on every purchase. It's been silently failing (caught by its own deliberate try/catch, so checkout itself never broke) since the loyalty program shipped — **loyalty credit has likely never actually been awarded to a real buyer yet.** Fixed with a policy scoped to only the `loyalty_credit` kind, for the caller's own profile.

Both are now confirmed fixed against a real local Postgres instance (all 28 migrations applied clean, in order) — worth Steven double-checking his own wallet balance / a recent listing's sold status once this is live, since real past purchases were affected.

**Free-month subscription grants.** New "Grant free month(s)" button on `/admin/sellers` (`requireStaff("support")`, same bar as the existing tier-override button) — pick a tier and 1-24 months, writes directly to `profiles.subscription_tier` while remembering the prior tier so a new worker job (`revertExpiredSubscriptionGrants.ts`) can put it back once the grant expires. Deliberately layered on top of (not replacing) the existing "Override -> Elite" permanent override button, and shares that button's one already-accepted sharp edge: a real Stripe webhook firing mid-grant will silently overwrite/end it early.

**Public Top 10 leaderboard.** New `/leaderboard` (linked in the main nav) — ranks resellers by REALIZED profit (`price_gbp − opportunity's source_price_gbp − commission_gbp`, summed per seller from actually-completed, non-refunded orders with funds released), not the AI's pre-estimate. Honest limitation, worth knowing: this can only count profit on a listing that traces back to a Flipsta-sourced opportunity (the only place a real cost basis is known) — a reseller's own independently-sourced listing won't contribute yet.

**Net-ROI discovery floor.** `discoverOpportunities.ts`'s verification bar changed from an informal 20% GROSS margin proxy to an explicit 15% NET calculation — marketplace commission (standard tier's rate, the most conservative of the three) and a flat £4.99 shipping estimate are now actually subtracted before checking the bar (`MIN_NET_ROI_PCT` / `NET_ROI_SHIPPING_ESTIMATE_GBP` in `packages/shared/src/constants.ts`). **Read Steven's "when live oppotunities are available" as a GLOBAL discovery floor** (opportunities.status = 'live' is the existing generic "available" state used everywhere, not something scoped to the new live-show feature specifically) — flagged to him as this interpretation, open to correction if he meant something narrower.

**Verification:** all 28 migrations applied clean against a real local Postgres in order; `tsc` clean on both the web app and the worker; full test suite (54/54) passing; a genuinely fresh `npm install` + production build from a clean clone, twice (once before, once after the RLS-gap migration was added). The one piece that could NOT be verified in this environment: the host's WHIP browser-broadcast flow has never run against a real Cloudflare Stream account (no live credentials here) — written to the documented spec and Cloudflare's own published examples, but worth a real test broadcast the first time this goes live.

**Files delivered:** one consolidated zip — `supabase/migrations/0027_live_selling_and_grants.sql`, `0028_orders_rls_gaps.sql`; `apps/web/lib/cloudflareStream.ts`, `orderCreation.ts` (new); `apps/web/app/api/orders/route.ts` (refactored, no behavior change); `apps/web/app/api/live-shows/**` (new — show CRUD, stream-key, items, bid, buy-now); `apps/web/app/api/internal/live-shows/settle-item/route.ts` (new); `apps/web/app/api/admin/subscription-grant/route.ts` (new); `apps/web/app/api/leaderboard/route.ts` (new); `apps/web/app/api/admin/sellers/route.ts` (adds grant-expiry to the response); `apps/web/app/live/page.tsx`, `live/new/page.tsx`, `live/[id]/page.tsx`, `leaderboard/page.tsx` (new); `apps/web/app/admin/sellers/page.tsx` (grant button); `apps/web/app/components/SiteNav.tsx` (Live + Leaderboard links); `apps/worker/src/jobs/closeExpiredLiveItems.ts`, `revertExpiredSubscriptionGrants.ts` (new); `apps/worker/src/index.ts` (wires both in); `apps/worker/src/jobs/discoverOpportunities.ts` (net-ROI change); `packages/shared/src/constants.ts` (new constants); `render.yaml` (Cloudflare Stream + INTERNAL_API_SECRET + WEB_APP_INTERNAL_URL); `INFRASTRUCTURE_TODO.md` (new #13 for all of the above).

### -13. Real bug: eBay's OAuth redirect_uri isn't a URL — it's an eBay-generated "RuName"

Found the same way as #-12, immediately after — walking Steven through eBay's actual signup flow (the channel he picked to do next), and checking eBay's own docs before giving him the exact steps rather than assuming the same shape as every other channel. eBay's Authorization Code Grant flow does NOT take a real callback URL in its `redirect_uri` parameter the way Etsy/Depop/Whatnot/StockX all do — it takes an eBay-generated identifier called an **RuName**, created under Your Account > Application Keys > User Tokens, which eBay internally maps to the accept/decline URLs you configure when creating it. Confirmed directly against eBay's own developer docs (the documented authorize URL literally shows `redirect_uri=<app-RuName-value>`). `channelOAuth.ts`'s `buildChannelAuthorizeUrl()` and `exchangeChannelCodeForToken()` were both sending the real `https://flipsta.co.uk/api/channel-connections/ebay/callback` URL as `redirect_uri` for every channel including eBay — eBay would have rejected that outright. **Nobody had connected eBay yet, so this had never been exercised for real.**

Fixed: new `usesRuNameAsRedirect` flag on eBay's config only (false for the other four channels, which are unaffected and correctly take a real URL), a new `CHANNEL_EBAY_RUNAME` env var (alongside the existing `CHANNEL_EBAY_CLIENT_ID`/`_CLIENT_SECRET`), and a `resolveRedirectParam()` helper used consistently by both the authorize-URL builder and the token-exchange call, so the RuName gets sent in both places it's needed (the token exchange's `redirect_uri` must match whatever the authorize request used). `INFRASTRUCTURE_TODO.md` #9's eBay bullet now explains the RuName step Steven needs to complete on eBay's side — set its "Auth Accepted URL" to the real callback URL, then use the RuName value it generates as `CHANNEL_EBAY_RUNAME`.

Verified: web typecheck clean, full 54/54 suite still passes, fresh disposable production build from a clean copy of the working tree.

**Files delivered:** `flipsta-ebay-runame-fix.zip` — `apps/web/lib/channelOAuth.ts`, `render.yaml` (new `CHANNEL_EBAY_RUNAME` slot), `INFRASTRUCTURE_TODO.md` (eBay + Etsy bullets both updated — Etsy's now also documents the Personal App / Commercial Access distinction learned live in #-12's walkthrough). No migration.

### -12. Real bug: the connectable channel list had silently drifted back to Amazon/Vinted/Facebook Marketplace

Found while walking Steven through the Etsy developer signup he asked for, right after delivering #-11 — went to confirm the exact redirect URI / scopes to give him and discovered `packages/shared/src/salesChannels.ts` (the source of truth for which five channels exist at all) still listed Amazon, Vinted, and Facebook Marketplace instead of Etsy, Whatnot, and StockX — even though `INFRASTRUCTURE_TODO.md` #9, `render.yaml` (the `CHANNEL_ETSY_CLIENT_ID` etc. slots), and this same file's own `publishListingToChannel()` doc comment all already described Etsy/Whatnot/StockX as the real, current set. A comment already sitting in that file explained why: an earlier attempt at this exact swap only updated `salesChannels.ts` and not `channelOAuth.ts`'s matching channel-static map (which is keyed off the same union type), broke the build, and got reverted rather than finished — so the revert papered over a compile error instead of completing the feature, and everything documentation-side kept describing a channel set that didn't actually exist in the deployed app. Practically: **the "Connect Etsy account" flow Steven was about to be walked through could not have worked at all** — `etsy` wasn't a valid channel key, so it wouldn't even have appeared as an option.

Fixed properly this time, both files together: `salesChannels.ts` now lists eBay, Etsy, Depop, Whatnot, StockX (Amazon/Vinted/Facebook Marketplace moved to a comment explaining why each is deliberately deprioritised, not deleted from the plan — matches `INFRASTRUCTURE_TODO.md` #9's existing framing). `channelOAuth.ts`'s channel-static map now has real entries for `etsy`/`whatnot`/`stockx` instead of `amazon`/`vinted`/`facebook_marketplace`. Etsy's entry uses real, verified endpoints (`https://www.etsy.com/oauth/connect` authorize, `https://api.etsy.com/v3/public/oauth/token` token — confirmed against developers.etsy.com's own docs), PKCE with no client secret at all (Etsy Open API v3 is a public-client-only flow — `CHANNEL_ETSY_CLIENT_ID` is the only credential needed, no `_SECRET`), and `listings_r`/`listings_w` scopes. Whatnot and StockX stay fully env-configurable (gated, account-specific URLs issued on approval), matching the existing Depop pattern. One test (`salesChannels.test.ts`) referenced `"amazon"` as a stand-in channel key — updated to `"etsy"`.

Verified: full 54/54 suite still passes, web + worker typecheck clean, fresh disposable production build from a clean copy of the working tree.

**Files delivered:** `flipsta-web-channel-fix.zip` — `lib/channelOAuth.ts`. `flipsta-shared-channel-fix.zip` — `src/salesChannels.ts`, `src/salesChannels.test.ts`. No migration, no new env vars — `render.yaml`'s `CHANNEL_ETSY_CLIENT_ID`/`_WHATNOT_*`/`_STOCKX_*` slots were already correctly scaffolded, they just had nothing valid to point at until now.

### -11. Social login — Google, Facebook, Apple

Steven, 27 Aug 2026, verbatim: "need to have users be able to login with google, facebook and apple." Came up alongside a request to move on to registering the multi-platform listing OAuth apps (Section 9 of `INFRASTRUCTURE_TODO.md`, already built in an earlier round — that one's a Steven-does-it-himself registration task per channel, not new code, so no files delivered for it this round; walked through live instead).

**What's built.** `/login` and `/signup` both now show "or continue with Google / Facebook / Apple" buttons (`SocialAuthButtons.tsx`, one shared component). `api/auth/callback/route.ts` is new — handles the redirect back from Supabase once a provider's consent step finishes, exchanges the code for a real session, and sends the user on to `/opportunities`, anchored on `NEXT_PUBLIC_SITE_URL` (same fix, same reasoning as the earlier "sign out goes to localhost" bug in `api/auth/signout/route.ts` — never trust `req.url` behind Render's proxy).

**Referral pass-through kept working for OAuth too.** `/signup?ref=CODE` already threaded a referral code into `raw_user_meta_data` for email/password sign-up, resolved by the existing `handle_new_user()` trigger at profile-creation time. OAuth has no equivalent of `signUp`'s `options.data` — there's no user row yet when the redirect to Google/Facebook/Apple happens — so `SocialAuthButtons.tsx` stashes the ref code in a short-lived cookie first, and a new SQL function, `apply_oauth_referral()` (migration `0026`), reconciles it from `api/auth/callback` once the profile actually exists. It's guarded on both ends: only applies to a profile with no referrer yet, and only within a 10-minute window of that profile being created, so a stale cookie sitting in someone's browser months later can't retroactively credit an unrelated sign-in. Verified directly against a real local Postgres: a referred sign-up correctly gets `referred_by` set and both sides get their £5 wallet credit; calling the function again afterwards is a safe no-op (checked via the same session — wallet transaction count doesn't move).

**Display names stopped defaulting to the email prefix for social sign-ups.** `handle_new_user()` only ever looked for `raw_user_meta_data->>'display_name'`, which our own `/signup` form sets explicitly but Google/Facebook never do — Google gives `full_name`/`name`, Facebook gives `name`. Redefined the same way `0016_referral_program.sql` already redefined this exact function (new migration, `create or replace`, never touching the original `0004` file) to check those fields too before falling back to the email prefix. Apple deliberately shares no name field at all after the first authorization, so the fallback stays the last resort there either way — verified with a synthetic Google-shaped `raw_user_meta_data` row, came through as "Steven Smith" rather than "steven".

**What Steven still needs to do himself — this can't be done on his behalf.** Nothing here needs a new Render env var (unlike Stripe/Awin/channel OAuth) — all three providers are configured entirely in the Supabase dashboard (Authentication → Providers), each needing its own developer-account registration: Google Cloud Console (free, simplest), Facebook for Developers (free), and Apple Developer Program (**$99/year membership required just to start**, plus a signed JWT client secret that needs periodic regeneration — by far the most involved of the three). Full step-by-step for all three is in `INFRASTRUCTURE_TODO.md` #12. Reasonable to launch with just Google + Facebook and add Apple later given the cost/setup gap. None of this blocks anything — with a provider not yet turned on, its button just returns an error and the user lands back on `/login` with a message, no broken flow either way.

**Files delivered:** `flipsta-migration-0026.zip` — `supabase/migrations/0026_social_login.sql`. `flipsta-web-social-login.zip` — `app/components/SocialAuthButtons.tsx` (new), `app/api/auth/callback/route.ts` (new), `app/login/page.tsx`, `app/signup/page.tsx`, `INFRASTRUCTURE_TODO.md` (new Section 12).

Verified: web typecheck clean, full disposable production build from a fresh copy of the working tree (`/login`, `/signup`, `/api/auth/callback` all present in the build output), the full `0001`–`0026` migration chain applied clean against a real local Postgres, and the referral-credit + display-name-fallback logic functionally tested against that same database (not just "the SQL runs" — actually inserted rows and checked the results).

### -10. Awin affiliate integration — a genuinely separate revenue stream, built end to end, inert until Steven signs up

Steven, 27 Aug 2026, verbatim: "i need assistance setting up Awin api to fill my store with goods." Scoped via clarifying questions: this is a new commission-earning affiliate section, deliberately separate from Flipsta's core buy/resell business, plus using the same real data to sharpen the AI's own search ("this is seperate from our core buisness. then you can use this info to help search better"). Pilot scope confirmed: 2-3 merchants first, not "sync everything."

**How it works.** Awin is a free-to-join affiliate network — Flipsta never owns, holds, or ships anything synced through it. A product on `/partner-deals` (new, public, no sign-in needed) shows a real photo/price/description pulled from a merchant's live Awin feed; clicking "Buy on [Retailer]" sends the shopper to complete the purchase on the merchant's own site via Awin's tracked link, and Flipsta earns a commission if it converts. Deliberately its own tables (`affiliate_products`, migration `0025`) rather than reusing `shop_items` — every other purchase type in this app assumes Flipsta or a reseller physically holds and ships the item (escrow, fulfillment claims, delivery confirmation); none of that applies here, and mixing the two would make Flipsta look like it's selling something it never stocks. Clear on-page disclosure copy too — UK ASA/CAP rules require it, same discipline already applied to the "Flipsta is just a broker" language on `/shop`.

**Admin side.** New **Admin → Partner Deals** page: shows setup instructions and does nothing until `AWIN_API_TOKEN`/`AWIN_PUBLISHER_ID` are set (see below); once they are, it calls Awin's own API live to show every merchant programme Steven's actually approved for, and lets him add/remove one at a time — the "small pilot" decision made a real, visible admin choice (`awin_sync_config`, migration `0025`) rather than a default of syncing everything approved. A live product count per merchant shows whether a pilot merchant is actually syncing anything yet.

**The sync itself.** New worker job `syncAwinProducts.ts`, every 6 hours (feeds don't update more often than that, and the pilot is small) — reads the admin's active merchant list, pulls each one's real Awin product feed (`apps/worker/src/adapters/awinClient.ts`), and upserts into `affiliate_products`. One merchant's feed failing (a transient Awin outage, a programme with no feed generated yet) doesn't block the others in the same run.

**"Use this info to help search better."** The same real, synced Awin prices now feed into the AI discovery prompt (`claudeSearchAdapter.ts`) as a new "REAL PRICE BENCHMARK" signal — a real, currently-live median retail price per category (once there are 3+ synced products in it), for the AI to weigh a source retailer's own "was" price against. This is external ground truth, not another opinion — a different kind of signal from the existing sell-through-rate performance notes.

**What Steven still needs to do himself — this can't be done on his behalf:** sign up as an Awin publisher (needs his own business details), apply to 2-3 merchant programmes, generate his API token at `ui.awin.com/awin-api`, and hand `AWIN_API_TOKEN` / `AWIN_PUBLISHER_ID` to whoever manages Render (already scaffolded in `render.yaml`, both `sync: false`, on **both** flipsta-web and flipsta-worker). Full step-by-step is in `INFRASTRUCTURE_TODO.md` #6 and repeated on the `/admin/partner-deals` page itself when the token isn't set yet.

**Known, deliberately flagged limitation.** The two REST endpoints used (auth, joined-programmes lookup) are confirmed against Awin's own published API docs. The product feed list/download parsing follows Awin's long-documented, widely-used CSV column conventions (`aw_deep_link`, `aw_image_url`, `search_price`, etc.) but couldn't be tested against a real response — no publisher account existed yet to test with while this was built. Parsing is deliberately defensive (tolerant of missing/reordered columns, skips a row it can't make sense of rather than crashing the sync) for exactly that reason. **Spot-check the first real sync** — once Steven's added his first merchant on `/admin/partner-deals`, check the product count actually looks right and a few `/partner-deals` cards show sensible prices/links — same "verify the first several real runs" discipline already applied to `claudeSearchAdapter.ts`'s real discovery.

**Files delivered:** `flipsta-migration-0025.zip` — `supabase/migrations/0025_awin_affiliate.sql`. `flipsta-web-awin.zip` — `lib/awin.ts` (new), `api/admin/awin-sync/route.ts` (new), `admin/partner-deals/page.tsx` (new), `admin/layout.tsx`, `api/affiliate-products/route.ts` (new), `partner-deals/page.tsx` (new), `components/SiteNav.tsx`, `render.yaml` (new `AWIN_API_TOKEN`/`AWIN_PUBLISHER_ID` slots, both services), `INFRASTRUCTURE_TODO.md` (Awin setup steps). `flipsta-worker-awin.zip` — `adapters/awinClient.ts` (new), `jobs/syncAwinProducts.ts` (new), `jobs/discoverOpportunities.ts`, `adapters/sourceAdapter.ts`, `adapters/claudeSearchAdapter.ts`, `index.ts`.

Verified: 54/54 tests pass, web + worker typecheck clean, full disposable production build from a fresh copy of the working tree (all routes including `/partner-deals`, `/admin/partner-deals`, `/api/affiliate-products`, `/api/admin/awin-sync`), and the full `0001`–`0025` migration chain applied clean against a real local Postgres.

### -9. Buyback insurance wired up, Sniper Mode built end to end, listing flow overhauled, and the upgrade-checkout crash fixed

Steven, 27 Aug 2026, verbatim: "is buyback insurance setup? need to do this if not. Sniper mode needs setting up with its own tab. One click platform listing needs overhauling. Needs to have great features, please think of some to make it a pleasurable and easy experience. the details, photos and everything needs to be auto filled in. you have this info from the opportunity if brought that way. When i click upgraade to pro or any others i get Unexpected token '<', "<!DOCTYPE " is not valid JSON." Four real pieces of work:

**1. Buyback insurance — was designed but never wired up, now fully live.** The actual math (`calculateBuybackPremium`, `isBuybackClaimEligible`) has existed in `packages/shared/src/pricing.ts`, fully tested, since early in the project — nothing ever called it. Along the way, found a real schema mismatch: `buyback_policies.order_id` only ever pointed at the peer-marketplace `orders` table, but the real buyback use case (protecting an Instant Win) never creates an `orders` row at all. Migration `0024` fixes this properly — adds a parallel `opportunity_id` column, a check constraint requiring exactly one of `order_id`/`opportunity_id`, and denormalizes `profile_id` directly onto the table (same pattern `wallet_transactions` already uses).
- On the Opportunities page, winning with the new "Add buyback protection" checkbox computes a live premium (via the shared pricing function) and, on Instant Win, stores a real policy.
- Portfolio now shows a protection badge on any covered win, with the potential payout amount, and a real claim-filing form once you've actually listed it for resale (the two facts the anti-abuse eligibility check needs: when you listed it, and whether it was at or below the AI's estimate).
- A filed, eligible claim opens a real staff ticket (category `buyback_claim`) — same ticketing system every other escalation in this app goes through. New **Admin → Buyback Claims** page: approve (pays out via a `wallet_transactions` row, same ledger goodwill/loyalty credit already use) or reject, with a reason, same `requireStaff("admin")` + audit-log pattern as every other money-moving admin action here.
- **Known, deliberate limitation**: while building this, confirmed that Instant Win purchases don't actually charge Stripe anywhere yet (no PaymentIntent is created in that flow at all) — a real, pre-existing gap, separate from buyback and not fixed as a side effect of this round (too risky to bundle blind). Buyback is built consistently with that current state; flagging clearly here rather than leaving it to be discovered later. See "Still to do".

**2. Sniper Mode — genuinely automatic bidding, with its own tab.** `sniper_rules` (set a category, a max budget, a minimum margin, opt in) has existed in the schema since day one but had no API, no UI, and — critically — nothing ever actually placed a bid on anyone's behalf. Now:
- New **Sniper Mode** tab in the main nav (Pro/Elite only, same gating pattern as Fulfillment jobs) — `/sniper` lets a seller create/pause/resume/delete rules.
- New worker job `runSniperBids.ts`, same 30-second cadence as the auction-closing job: only acts in the last 5 minutes of an opportunity's action clock (real sniping — wait until the last moment rather than starting a bidding war early), processes matching rules for one opportunity sequentially so each reacts to the bid the last one just placed, bounded by a hard round cap so a misconfigured pair of rules can't loop forever in one tick.

**3. One-click listing, actually overhauled.** Title/price/description were already auto-filled from the won opportunity, and the photo was already shown — but the picker was a plain text dropdown, cross-posting defaulted off even for a Pro/Elite seller with channels already connected, and nothing about it was actually "one click." Rebuilt `/sell/new`:
- The dropdown is now a visual picker — every unlisted win shows as a card with its real photo, the AI's suggested price, and the expected profit, right there to compare at a glance.
- A genuine one-click **"⚡ Quick list"** button on every card — publishes instantly with the AI's title/price/description/condition and, for Pro/Elite, auto cross-posts to every marketplace already connected. No form required.
- **"⚡ Quick list all"** clears every unlisted win in one go when there's more than one, with a per-item result summary.
- The full manual form is still underneath for anyone who wants to review or edit first — nothing was removed, just no longer the only path.
- Deep-linkable via `/sell/new?opportunityId=...` — Portfolio's won-opportunity cards now carry a direct "⚡ List this item" button that jumps straight there with that exact win pre-selected.
- **Known limitation, consistent with the rest of the schema**: this still auto-fills from a single opportunity photo (`opportunities.image_url`) — there's no multi-photo upload anywhere in Flipsta yet (products/wishlist/shop_items all store exactly one `image_url` too), so a real photo-gallery feature would be new scope, not a fix. Worth a look if listings ever need more than one photo per item — see "Still to do".

**4. "Unexpected token '<'" on Upgrade to Pro/etc. — fixed defensively.** Checked both `/api/billing/checkout` and `/api/billing/portal` — every code path in both already returns real JSON, including every error case (even "not configured yet" is a proper 503 JSON body). That error is what a browser's `res.json()` throws when it's actually handed HTML — which is what happens if the request never reaches the route handler at all (most commonly: a deploy that's missing these route files, 404ing straight to Next's own HTML error page). `/upgrade` now reads the response as text first and only parses it as JSON after, so a genuine deploy gap now surfaces as a clear, readable message ("the latest web deploy is missing this page's API routes...") instead of a cryptic native error. If this happens again after redeploying, check Render's build log for `/api/billing/checkout` and `/api/billing/portal` specifically — that's the most likely real cause.

**Files delivered:** `flipsta-migration-0024.zip` — `supabase/migrations/0024_buyback_wireup.sql`. `flipsta-web-round9.zip` — `app/upgrade/page.tsx`, `app/opportunities/page.tsx`, `app/portfolio/page.tsx`, `app/sell/new/page.tsx`, `app/sniper/page.tsx` (new), `app/components/SiteNav.tsx`, `app/layout.tsx`, `app/api/opportunities/[id]/instant-win/route.ts`, `app/api/buyback/route.ts` (new), `app/api/buyback/claim/route.ts` (new), `app/api/admin/buyback-claims/route.ts` (new), `app/api/admin/buyback-claims/[id]/resolve/route.ts` (new), `app/admin/buyback-claims/page.tsx` (new), `app/admin/layout.tsx`, `app/api/sniper-rules/route.ts` (new), `app/api/sniper-rules/[id]/route.ts` (new). `flipsta-worker-sniper.zip` — `apps/worker/src/jobs/runSniperBids.ts` (new), `apps/worker/src/index.ts`.

Verified: 54/54 tests pass, web + worker typecheck clean, full disposable production build from a fresh copy of the working tree (all routes including `/sniper`, the rebuilt `/sell/new`, `/api/buyback`, `/api/buyback/claim`, `/admin/buyback-claims`, and the sniper-rules API), and the full `0001`–`0024` migration chain applied clean against a real local Postgres.

### -8. AI support chatbot + Buyer Wants finished

Steven, 27 Aug 2026: "need a Ai chat bot that can assist with any quiries people may have. needs to cover all areas before passing to a real agent. need to set this up on the admin dashboard aswell so we can track who we have spoken to etc." Scoped via a clarifying question: a floating widget on every page (not a dedicated help page); able to use the asker's own real account data when signed in, not just general FAQ; escalates by opening a real ticket in the existing admin system rather than a separate live-handoff build.

**Support chatbot.** New `chat_conversations`/`chat_messages` tables (migration `0023`) — nothing like this existed before (`tickets.body` is a single field, not a thread). `POST /api/chat` is the one endpoint the widget calls: creates/continues a conversation, and — for a signed-in shopper — gathers a real, small summary of their own recent orders, Flipsta Sourced Deals purchases, won opportunities, wallet balance, and open tickets (`lib/supportChat.ts`'s `buildAccountContext`) and hands it to Claude Sonnet 5 as context, never invented. The model always replies through a forced tool call (`respond_to_shopper`) that also says whether this needs a human — set to true for anything it can't genuinely resolve (a dispute, a refund, a bug, or the shopper just asking for a person). An escalation opens a real ticket (category `account`) via the same ticketing system Section 12.1 already has, and marks the conversation `escalated`. A signed-out visitor can still chat for general questions, but can't be escalated (no profile to attach a ticket to) — told to sign in instead. New **Admin → Support Chats** page lists every real conversation (not just escalated ones) so staff can see where the bot is genuinely helping vs. where it keeps failing on the same topic, with a link through to the ticket for escalated ones.

**Buyer Wants finished, not removed.** Asked directly whether the tab was still relevant — decided to finish it: it's a genuinely different mechanism from Flipsta It! (other resellers competing downward on price for a specific want, vs. an AI-sourced, admin-gated search), and the backend (`POST /api/wants`, `POST /api/wants/:id/offer`) already fully worked — the page just had no form for either. Added a "Post a want" form and a per-want "make an offer" input (hidden for the want's own buyer, and once it's fulfilled), no backend changes needed.

**Files delivered:** `flipsta-migration-0023.zip` — `supabase/migrations/0023_support_chatbot.sql`. `flipsta-web-support-chatbot.zip` — `lib/supportChat.ts` (new), `api/chat/route.ts` (new), `api/admin/chats/route.ts` + `[id]/route.ts` (new), `admin/chats/page.tsx` + `[id]/page.tsx` (new), `admin/layout.tsx`, `components/SupportChatWidget.tsx` (new), `app/layout.tsx`. `flipsta-web-buyer-wants-finished.zip` — `app/wants/page.tsx`.

Verified: 54/54 tests pass, web + worker typecheck clean, full disposable production build from a fresh copy of the working tree (all routes including `/api/chat`, `/admin/chats`, and the rebuilt `/wants`), and the full `0001`–`0023` migration chain applied clean against a real local Postgres.

**Not yet done, worth knowing:** the chatbot's account-lookup is read-only and deliberately small (last 5 rows per surface) — it can't take an action (no refunds, no cancellations) by design, only describe what it sees and escalate. No env var changes needed — it reuses the same `ANTHROPIC_API_KEY` already set on flipsta-web for Flipsta It!.

### -7. Upgrade-plan page rebuild, goodwill credit, and three real bugs fixed

Steven, 27 Aug 2026: "need to create a page for when people click Upgrade plan, needs to have the upgrade options available to them in a clear options with perks per tier" — plus, in the same session, three more real issues flagged directly.

**1. `/upgrade` rebuilt as a real 4-tier comparison.** A page already existed here (linked from `/dashboard`'s "Upgrade plan" button, backed by real Stripe Checkout/Billing Portal routes) but showed only a one-line blurb per paid tier and left Free out entirely. Rebuilt as a genuine Free/Standard/Pro/Elite comparison with a real perk checklist per tier, the signed-in user's current plan highlighted, and the CTA per card adapting (upgrade / "your current plan" / "manage billing to switch" for a downgrade). Commission % and buyback discount are pulled live from `packages/shared/src/constants.ts` and `lib/tierGuard.ts`'s `TIER_ENTITLEMENTS` rather than retyped, so the page can't silently drift from what the rest of the app actually enforces.

**2. Goodwill / "sorry" wallet credit.** Steven: "need the ability to add credit to people to spend on the store for sorry's etc." New `POST /api/admin/wallet-credit` (requires "admin", not just "support" — reason mandatory, capped at £500 as a sanity ceiling against a typo, not a business rule) reuses the exact same `wallet_transactions` ledger as loyalty/referral credit — migration `0022` just adds a `goodwill_credit` kind. A "Grant credit" button on **Admin → Sellers** prompts for an amount and a reason and calls it. Shows up on the recipient's `/wallet` immediately, spends exactly like any other credit.

**3. Real bugs fixed, all found and reported directly by Steven:**
- **Sign-out redirected to localhost in production.** `new URL("/", req.url)` was trusting whatever the incoming request resolved to rather than a known-good address. Now anchored to a new `NEXT_PUBLIC_SITE_URL` env var (`https://flipsta.co.uk`, set directly in `render.yaml` since it isn't a secret) with `req.url` only as a local-dev fallback.
- **"List an item" and "Buyer Wants" were reachable while signed out.** Every other account-only nav tab (Dashboard, Flipsta It!, Portfolio, Wishlist, Wallet) was already hidden for signed-out visitors — these two weren't. Now hidden in `SiteNav.tsx` like the rest, and — since a signed-out visitor could still reach either by a direct link — both pages now show a "Sign in to…" prompt instead of their real content, the same pattern `/wallet` already uses.
- Along the way: confirmed **Buyer Wants' page is real but thin** — it lists wants and ranked offers from the real `buyer_wants`/`want_offers` tables, but there's no form on the page to actually post a new want or submit an offer, even though both API routes support it. Raised directly with Steven rather than silently left as-is — see "Still to do".

**Files delivered:** `flipsta-migration-0022.zip` — `supabase/migrations/0022_goodwill_credit.sql`. `flipsta-web-upgrade-credit-navfixes.zip` — `app/upgrade/page.tsx`, `app/api/admin/wallet-credit/route.ts` (new), `app/admin/sellers/page.tsx`, `app/components/SiteNav.tsx`, `app/wants/page.tsx`, `app/sell/new/page.tsx`, `app/api/auth/signout/route.ts`, `render.yaml`.

Verified: 54/54 tests pass, web + worker typecheck clean, full disposable production build from a fresh copy of the working tree (all routes including `/upgrade` and `/api/admin/wallet-credit`), and the full `0001`–`0022` migration chain applied clean against a real local Postgres.

## Confirmed applied — most recent first

### -6. Recommendations ("basic" personalization) — confirmed applied by Steven

The one candidate from the conversion/retention research Steven's follow-up scoping question didn't pick (the other four became #-5 below) — built as its own follow-on since it was the natural remaining piece: "recommending items based on a shopper's own sizing profile / past purchases."

New `GET /api/recommendations` — for a signed-in shopper with real history, scores available shop items against two genuine signals: categories they've actually bought from before (across all three purchase surfaces — shop items, won opportunities, peer-marketplace orders) and any size saved on one of their shopper profiles (migration `0018`, same data the `/shop` "who are you shopping for" switch already uses). A "Recommended for you" section now shows on `/` and `/shop` — but **only** when there's a real match; signed-out visitors and signed-in shoppers with no purchase history or saved sizes see nothing, deliberately, rather than a generic "trending now" list standing in for personalization that isn't actually happening. Same real-data-only discipline as #-5's low-stock badges and deal-drop emails — see that section's dark-patterns research for why that distinction matters.

Small refactor alongside it: the row-grouping logic in `GET /api/shop-items` (one card per product, several stock rows collapsed into a real `unitsAvailable` count) was pulled out into `apps/web/lib/shopItemGrouping.ts` so the new recommendations route could reuse the exact same logic instead of copying it — `/api/shop-items` itself behaves identically, just reading from the shared helper now.

**Files delivered:** `flipsta-web-recommendations.zip` — `lib/shopItemGrouping.ts` (new), `api/shop-items/route.ts` (refactored, not behaviourally changed), `api/recommendations/route.ts` (new), `shop/page.tsx`, `page.tsx` (homepage).

Verified: 54/54 tests pass, web typecheck clean, full disposable production build (all 42 routes, including the new `/api/recommendations`) from a fresh copy of the working tree. No schema change, so no migration was needed.

### -5. Engagement round — loyalty credit, reviews, real low-stock badges, deal-drop emails — confirmed applied by Steven

Steven picked all four candidate features from the research (kept below for the sourcing/reasoning) via a follow-up scoping question:

**1. Loyalty credit (1% of spend as wallet credit)** — reuses the *existing* wallet ledger (`wallet_transactions`) rather than a new points system, per Steven's confirmed answer. Migration `0021` adds a `loyalty_credit` kind to the existing check constraint. Awarded automatically at the moment of purchase on all three purchase surfaces (peer marketplace orders, Flipsta-sourced shop items, Instant Win) — see `apps/web/lib/loyalty.ts`. First-pass choice, same status as `REFERRAL_REWARD_GBP`: awarded immediately, not gated behind delivery/escrow release — revisit if refund clawback ever matters at real volume.

**2. Product reviews (verified purchasers only)** — real discovery while building this: a `reviews` table and a full `/api/reviews` already existed since day one (Section 12.4 of the concept doc — seller ratings on peer-marketplace orders) but were never wired into any page. This round finally surfaces that in Portfolio (leave a review on a delivered order bought from another seller; your own average rating as a seller now shows above "My sales"). Separately, a brand-new `product_reviews` table + `/api/product-reviews` covers the two purchase types that have no peer "seller" to rate — Flipsta-sourced shop items and won opportunities — also surfaced in Portfolio, and average ratings now show as stars on `/shop` cards.

**3. Real low-stock badges** — no schema change needed, `shop_items` already tracks genuine per-unit stock. `/shop` cards now show "Only N left" (in red) once a product's real `unitsAvailable` drops to 3 or fewer (`SHOP_LOW_STOCK_THRESHOLD_UNITS` in `packages/shared/src/constants.ts`), otherwise the existing neutral "N available" badge. Always a true count — see the dark-patterns research below for why that matters.

**4. Deal-drop email notifications** — the missing "Trigger" stage of the Hook Model from the research. A new worker job (`notifyDealMatches.ts`, runs every 30 min) checks newly-landed shop items against (a) exact wishlist matches and (b) a shopper profile's saved sizes, and emails matched shoppers once per run (never one email per item). Reuses the Resend wrapper that already existed in `apps/web/lib/notifications.ts` but was never wired to anything beyond a ticket-update stub — moved to `packages/shared` this round so the worker can use it too. `notify_deal_matches` on `profiles` (default **on**) lets anyone switch it off from `/account` in one click — deliberately as easy to turn off as it was to default on, given the CMA/ICO scrutiny on one-sided opt-out flows (see below).

**Files delivered:**
- `flipsta-migration-0021.zip` — `supabase/migrations/0021_engagement_features.sql`.
- `flipsta-shared-engagement.zip` — `packages/shared/src/constants.ts`, `notifications.ts` (new), `index.ts`.
- `flipsta-worker-deal-notifications.zip` — `apps/worker/src/jobs/notifyDealMatches.ts` (new), `index.ts`.
- `flipsta-web-engagement-features.zip` — `lib/notifications.ts` (now re-exports from shared), `lib/loyalty.ts` (new), the 3 purchase routes (orders/shop-items/instant-win, now award loyalty credit), the new product-reviews routes + summary route, the new account/notification-prefs route, the extended `/api/reviews` (added a `mine=true` mode), the new `ReviewForm.tsx` component, `portfolio/page.tsx`, `account/page.tsx`, `shop/page.tsx`, and `render.yaml`.

Verified: 54/54 tests pass, `packages/shared` + web + worker all build/typecheck clean, full disposable production build (all 41 routes, including the 3 new API routes) from a fresh copy of the working tree, and the full `0001`-`0021` migration chain applied clean against a real local Postgres (twice — once right after writing `0021`, once again from a fresh clone as the final check).

---

**Original research write-up (kept for the sourcing/reasoning):**

Steven: "go away and look at proven selling techniques that will encorage a user to purhase from a site and also what makes it almost addictive to keep coming back." Real research done, summarised below against what Flipsta already has (at the time this was written — every gap called out here is now closed by #-5 and #-6 above).

**What actually drives a purchase decision (conversion):**
- Trust/social proof — reviews, ratings, "X people bought this" — now built (see #-5's #1/#2).
- Friction reduction at checkout — fewer steps, guest checkout, visible progress. Flipsta's basket→checkout is already fairly short; worth a real look but not an obvious gap.
- Genuine urgency/scarcity — "3 left" style messaging **grounded in a real number**, not an invented countdown — now built (see #-5's #3).
- Personalisation — recommending items based on a shopper's own sizing profile / past purchases — now built (see #-6 above).
- High-quality product photos — already addressed in the AI/worker round (crop fix, `object-contain`).

**What makes people come back on their own (retention / "the Hook Model"):**
Nir Eyal's Hook Model (researched — see sources) breaks a habit-forming product into four repeating stages:
1. **Trigger** — something outside the product that brings someone back (an email, a notification, a text) — now built (see #-5's #4).
2. **Action** — the easy behaviour the trigger leads to (open the app, check the deals feed). Already easy on Flipsta — `/shop` and `/` already surface live deals.
3. **Variable reward** — an unpredictable payoff each time, which is exactly what a live, constantly-changing AI-sourced deals feed already naturally is. This is arguably Flipsta's strongest existing asset for this loop.
4. **Investment** — the user puts something in that makes the product more valuable to them next time (saving items, building a profile, earning credit). Flipsta already had the wishlist and the referral programme; loyalty credit (#-5's #1) is now the explicit version of this too.

**Loyalty/gamification mechanics that specifically drive repeat purchases** (researched — see sources), roughly in order of how well they'd fit a resale/deals marketplace like Flipsta:
- Points-per-purchase with a redemption use (store credit, early access to new deals) — now built as loyalty credit (#-5's #1).
- Tiered status (Flipsta already has Free/Standard/Pro/Elite reseller tiers, but that's about selling capability, not a buyer-facing rewards ladder) — still not built.
- "Streaks" (Duolingo-style — come back N days running) — genuinely effective per the research but needs care: only worth it if there's a real reason to check daily, otherwise it's a gimmick. Not built — deliberately deferred, see "Still to do".
- Referral rewards — already built and already using the right psychology (reward the actual action, not just signup).

**The legal guardrail (why this section exists at all — Steven's word "addictive" is worth being careful with):**
The UK's CMA and ICO have been actively increasing enforcement against "dark patterns" — the same psychological techniques above become illegal the moment they're **faked** rather than real. Specifically flagged as enforcement targets: fake countdown timers / stock claims not backed by real numbers, making it harder to unsubscribe/cancel than to sign up, guilt-tripping ("confirmshaming") language, hiding real costs until late in checkout, and pre-ticked/biased defaults. The distinction the regulators draw isn't "urgency bad" — it's **real vs invented**. Every feature built above is real-data-backed by construction (genuine stock counts, genuine wishlist/size matches, genuine purchase-history-based recommendations, one-click opt-out) — worth remembering as a hard rule for anything built on top of this: never show a number, timer, or claim that isn't literally true.

Sources used for this research:
- [The Hook Model: Retain Users by Creating Habit-Forming Products (Amplitude)](https://amplitude.com/blog/the-hook-model)
- [Ecommerce Conversion Optimization in 2026: 10 Proven Strategies (Kickflip)](https://gokickflip.com/blog/ecommerce-conversion-optimization)
- [Ecommerce Loyalty Program: 8 Mechanics That Drive Repeat Purchase (enable3)](https://enable3.io/blog/loyalty-program-for-ecommerce)
- [ICO and CMA clamp down on dark patterns in the UK (Osborne Clarke)](https://www.osborneclarke.com/insights/ico-and-cma-clamp-down-dark-patterns-uk)
- [Online Choice Architecture and Dark Patterns: Regulatory Enforcement in the EU and UK (Druces)](https://druces.com/the-regulation-of-online-choice-architecture-from-user-experience-to-enforcement-how-regulators-are-acting-on-harmful-online-choice-architecture-in-the-eu-and-uk/)

### -4. Outcomes-learning AI + "Flipsta It!" round — confirmed applied by Steven

The two big asks from the prior round, scoped via a clarifying question and built:

**1. Smarter AI, informed by real research + real outcomes** — Steven: "go away and look at selling trends, techniques. Look a ted talks. Write ups on the web to assist the bot in making better decisions... Also leanr over time what sells well and not." Two real pieces:
- **Research → prompt guidance**: read real retail-arbitrage/reselling sourcing guides, trend-spotting methods, sell-through-rate benchmarks, and a TED talk on retail psychology (see Sources at the bottom of this section). Distilled into a new "SELLING TECHNIQUE NOTES" block in `claudeSearchAdapter.ts`'s prompt: exact-match discipline (don't compare against a near-miss product), favouring sustained demand evidence over a single isolated sale, and pricing in real fee/shipping/estimation headroom (validates the existing 20% margin floor rather than replacing it).
- **Auto-computed performance signal** — the actual "learn over time" piece. Every discovery run now computes, per category, what % of recent shop_items actually sold (`paid_at` set) and what % of recent opportunities were actually won, using real industry sell-through-rate benchmarks (~70%+ = strong, under ~35% = weak — only surfaced when there's at least 5 recent data points, so a thin sample never generates a misleading note). Fed into the search prompt the same way an admin's focus note is, but computed from real Flipsta sales data, not anyone's opinion — no admin table, nothing to maintain.

**2. "Flipsta It!" — request-a-deal** — Steven: "Need a button that says Flipsta It!... ask for a description and a photo, give the user some google images to choose from... this then goes to admin panel to approve. Then admin click a button AI then goes out and finds the deal." Confirmed via clarifying questions: photo candidates come from Claude's own web search (no new image-search API/cost), and texting the shopper when found is a deliberately later round ("for now just add the button and the UI").
- New `/flipsta-it` page: describe the item + target price, optionally search for and pick a reference photo, submit. Shows the shopper their own requests and status underneath.
- New **Admin → Flipsta It! Requests** page: approve/reject pending requests, then a separate "Search now" button on an approved one (so approving doesn't itself spend AI budget — searching is its own deliberate click).
- The actual targeted search (`apps/web/lib/buyRequestSearch.ts`) is a real, single-attempt Claude web search for that specific item at or under the shopper's target price — not a retry loop or a notification queue, matching Steven's "for now" scope exactly.
- A banner on `/shop` explains the feature and links to it.
- Deliberately its own table (`buy_requests`, migration `0020`), not built on top of the existing `buyer_wants`/"Buyer Wants" feature — that one's a peer reverse-auction where other human resellers compete with offers; this is AI-sourced and admin-gated, a genuinely different mechanism. Worth knowing the two exist side by side now.

**Env var**: `ANTHROPIC_API_KEY` set on **flipsta-web** as well as flipsta-worker — confirmed applied by Steven.

**Files delivered:** `flipsta-migration-0020.zip`, `flipsta-worker-selling-technique-notes.zip`, `flipsta-web-flipsta-it.zip`.

Verified: 54/54 tests pass, web + worker typecheck clean, full disposable production build from a fresh copy of the working tree, and the full `0001`-`0020` migration chain applied clean against a real local Postgres.

Sources used for the research piece:
- [Retail Arbitrage Sourcing Checklist 2026](https://www.underpriced.app/tools/retail-arbitrage-sourcing-checklist) — exact-match, sold-comps, and margin-ceiling discipline.
- [5 Proven Methods to Spot Trending Products Before Competitors](https://syedafnanadit.medium.com/5-proven-methods-to-spot-trending-products-before-competitors-951dcee7b63d) — sustained-growth-vs-spike trend signals.
- [Sell-Through Rate: Your Key to Inventory Success](https://www.inflowinventory.com/blog/what-is-sell-through-rate-heres-why-it-matters-for-your-business/) — the 70%/35% benchmark thresholds used in the new performance signal.
- [Kieran Clinton-Tarestad: Everything you know about retail is wrong (TED Talk)](https://www.ted.com/talks/kieran_clinton_tarestad_everything_you_know_about_retail_is_wrong) — retail psychology angle (needs/wants/desires over pure price optimization).

### [RESOLVED] /admin returning a 500 — real bug, fixed and confirmed applied

Right after tonight's round went out, `flipsta-web.onrender.com/admin` started 500ing. Steven found the actual error in Render's logs: `Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server"...`.

**Real root cause**: `admin/page.tsx` (a Server Component — fetches its data straight from Supabase server-side) was passing an inline `formatValue` function as a prop into `BarChart.tsx` (a Client Component, `"use client"` — needed for the SVG chart). React Server Components can't serialize a function across that server→client boundary — only plain data can cross. This is a **runtime-only rule**: neither `tsc --noEmit` nor `next build` catch it (confirmed — both ran clean the whole time this bug was live), which is why it slipped through every verification pass done tonight and only surfaced once the page actually got hit on a real deploy. Checked the rest of the codebase for the same pattern (a server page passing an inline function prop into a `"use client"` child) — this was the only instance.

**Fix**: `BarChart` no longer takes a `formatValue` function — `admin/page.tsx` now pre-formats each bar's tooltip text into a plain string server-side and passes that instead. Same visual result, just a string crossing the boundary instead of a function.

**Files delivered:** `flipsta-hotfix-admin-500.zip` — `apps/web/app/admin/BarChart.tsx` + `apps/web/app/admin/page.tsx`.

Verified: typecheck clean, full `next build` clean, 54/54 tests pass. **Confirmed applied and working by Steven** ("yeah all good, carry one").

### [RESOLVED] -2. AI/worker cost & quality round + small fixes — confirmed applied by Steven

The four pieces deferred earlier behind consumer pages, now built, plus a few things Steven flagged mid-session that were quick enough to fold in:

- **Cheaper models** — `claudeSearchAdapter.ts` discovery calls now use `claude-sonnet-5` instead of `claude-sonnet-4-5` (same tier, ~33% cheaper: $2/$10 vs $3/$15 per MTok). `verifyDealStillActive` (the narrow "is this still live" re-check) now uses `claude-haiku-4-5` ($1/$5 per MTok). `WEB_SEARCH_MAX_USES` trimmed 14 → 8.
- **Dedup** — two independent layers: the search prompt is told what's already been found in roughly the last 30 days ("ALREADY FOUND RECENTLY"), and `discoverOpportunities.ts` hard-blocks creating an opportunity/shop_item whose (loosely normalized) product name matches something sourced recently — including within the same run.
- **Admin AI-focus control** — new **Admin → AI Focus** page: pause any category from discovery entirely, or leave it a short free-text steering note. Migration `0019`'s `discovery_focus` table.
- **Seasonal calendar** — new **Admin → Seasonal Calendar** page: add an event (name, categories, search window, stock-expiry date) and the AI actively favours matching products while the search window is open. Migration `0019`'s `seasonal_events` table + `shop_items.seasonal_event_id`.
- **AI-found items now capture sizes** — each shop_items row gets one real size read off the source page, cycling if there are more units than sizes reported, `null` if the product has none.
- **Product photos no longer look cropped/off-centre** — switched from `object-cover` to `object-contain` site-wide.
- **"AI-Sourced Deals" renamed to "Flipsta Sourced Deals"** everywhere it appears as a label.

**Files delivered:** `flipsta-migration-0019.zip`, `flipsta-worker-ai-cost-dedup-seasonal.zip`, `flipsta-web-ai-focus-seasonal-sizing-fixes.zip`.

Verified: 54/54 tests pass, web + worker typecheck clean, full disposable production build, and the full `0001`-`0019` migration chain applied clean against a real local Postgres. **Confirmed applied by Steven** ("yeah all good, carry one").

### 0. Homepage + account page + hamburger nav + size filter round — confirmed applied by Steven

- **Real homepage** — `/` now shows the latest shop deals and live opportunities.
- **`/account` page** — payment methods (Stripe Billing Portal) and shopper profiles (named sizing sets).
- **Hamburger category nav** — collapsible left sidebar on `/shop`.
- **"Who are you shopping for" size filter** — filters shop items/products to matching sizes; items with no size tag always show.

**Files delivered:** `flipsta-migration-0018.zip`, `flipsta-web-homepage-account-sizing.zip`. **Confirmed applied by Steven**: "ok thats all uploaded an ran."

### [RESOLVED] Web deploy failure — Module not found: './SundayDealsReminder'

Fixed via `flipsta-hotfix-sunday-reminder.zip`. Steven confirmed the redeploy loaded OK.

### [RESOLVED] Admin dashboard overhaul + referral program + auto-listing round

Admin dashboard graphs/signups/customer issues, resellers management panel, auto-list on Instant Win, referral program, reseller-upgrade prompts, new logo, trading-floor ticker. All confirmed live — see prior detail retained in version history if needed.

### 1. Categories-fix round — confirmed applied

### 2. Store features round — confirmed deployed

Categories, basket, search, wishlist, shop-photo admin queue.

### 3. Sunday deals-check reminder — delivered

### 4. Shop-fixes round 2 — confirmed delivered

### 5. Original shop/fulfillment feature — confirmed live

### 6. Still outstanding from earlier — 2 small web files (superseded, no action needed)

## Confirmed working end to end

- Real discovery genuinely creates and displays live opportunities.
- Instant Win genuinely wins the item — confirmed live.
- Portfolio shows won items under **My purchases** with full detail.
- Shop/fulfillment feature — confirmed live, real AI-sourced items with correct pricing math.
- Store features round — confirmed deployed.
- Outcomes-learning + Flipsta It! round — confirmed applied.
- Engagement round (loyalty credit, reviews, low-stock badges, deal-drop emails) — confirmed applied.
- Recommendations — confirmed applied.

## Today's real bugs found and fixed (for the record)

Full list of 7 historical bugs (RLS gaps, silent insert failures, pricing floor bug, missing category pills, missing opportunity→listing link) retained from prior updates — pattern across all: every one was either a write/fetch that failed *silently*, or a calculation/relationship that looked reasonable in isolation but was wrong once checked against a real number.

Also worth noting from the engagement round: two pre-existing, fully-built-but-never-surfaced features were found while working on it — the `reviews` table/`/api/reviews` route (seller ratings, built day one, never wired to a page) and `packages/shared/src/reviews.ts`'s `isValidRating`/`averageRating` helpers. Same shape as the bug pattern above, just one step earlier in the lifecycle: not a bug in shipped code, but real backend work that silently never made it into anything a user could reach. Worth a periodic check for other "built but never wired in" features given this is now the third time it's turned up (buyback insurance and sniper mode, #-9 above, are two more).

## Live / applied by Steven

- The site itself — `flipsta-web.onrender.com`, confirmed genuinely working with real data.
- `flipsta-worker` — running real discovery runs (confirmed via logs).
- Supabase migrations `0001`–`0021` all confirmed applied.
- `ANTHROPIC_API_KEY` set on both flipsta-web and flipsta-worker.
- `RESEND_API_KEY` set on both flipsta-web and flipsta-worker.
- Sign-up, login, password reset, admin roles, dashboard/wallet — tested and working.
- Stripe: webhook created, Customer Portal being configured, Connect set up as **Marketplace**.
- eBay/Etsy developer registration in progress.

## eBay sold-price data — researched, no real fix available

No self-serve API exists for sold/completed listing data.

## Still to do (no rush — some deliberately deferred)

- [ ] **Awin isn't actually signed up yet** — everything on Flipsta's side is built (#-10) but does nothing until Steven signs up as an Awin publisher himself, gets approved by 2-3 merchants, and sets `AWIN_API_TOKEN`/`AWIN_PUBLISHER_ID` on Render. See `INFRASTRUCTURE_TODO.md` #6 or `/admin/partner-deals` for the exact steps.
- [ ] **Awin's product feed parsing needs a real spot-check** — built against Awin's documented CSV column conventions, not an actual live response (no account existed yet). Check the first real sync's product counts and a few `/partner-deals` cards look right once Steven's added a merchant.
- [ ] **Instant Win purchases don't actually charge Stripe yet** — no PaymentIntent is created anywhere in `/api/opportunities/[id]/instant-win`. Found while wiring up buyback insurance (#-9); deliberately not fixed as a side effect of that round since it's real payment-flow surgery, not a quick add. Worth prioritising — buyback premiums, loyalty credit, and everything else downstream of a win currently all run against a purchase that isn't actually being paid for through Stripe.
- [ ] Buyback claims require manual admin approval — no auto-payout path, by design (same discipline as every other money-moving action here), but worth knowing if claim volume ever gets high enough to need one.
- [ ] Listings (and the opportunities/products/wishlist rows they come from) still only support a single photo (`image_url`) — real multi-photo upload isn't built anywhere in Flipsta yet. Not a gap introduced by the listing-flow overhaul (#-9) — just inherited from the existing schema — but worth a real decision if sellers want to add their own extra photos beyond the one AI-captured shot.
- [ ] A "new deals daily" streak/badge — deliberately not built; only worth it once there's a genuine daily reason to check, per the research.
- [ ] Once real shop items with sizes have gone through a few discovery runs, double check the `/shop` size filter is actually narrowing results correctly on real data.
- [ ] Flipsta It!'s "text the shopper when found" step is deliberately not built yet — worth a proper look once there's an SMS provider decision (Twilio or similar) to make.
- [ ] Flipsta It! is currently single-attempt, admin-triggered only — no automatic retry/re-search if the first attempt comes back not_found.
- [ ] The new auto-computed category performance signal needs real volume to say anything (5+ recent rows per category) — worth checking back in a week or two.
- [ ] Confirm migration `0012`/`0011` have been run (should already be, per earlier confirmations).
- [ ] Look at the blank category-name issue on opportunities.
- [ ] Finish Stripe: Products/Prices, Customer Portal, Connect account type finalised.
- [ ] eBay/Etsy developer credentials once registration completes.
- [ ] Depop — gated, needs direct outreach.
- [ ] Actually posting a listing to a connected channel is still a stub.
- [ ] Onboarding real resellers — deliberately deferred until the site is "perfect", per Steven.
- [ ] "🌟 Golden" opportunity badge — offered, no answer yet.
- [ ] Alibaba (bulk/wholesale sourcing) — deliberately not built.
- [ ] Before real launch, revert two temporary testing values: `ACTION_CLOCK_SECONDS` and `TARGET_OPPORTUNITIES_PER_RUN`.
- [ ] Delete the 2 harmless leftover 20 August test rows whenever convenient.
- [ ] Auction (non-instant-win) purchases show the instant-win price rather than the actual winning bid on the Portfolio card.
- [ ] Shop-items checkout doesn't collect a real shipping address yet.
- [ ] Shop-items pricing constants are first-pass numbers, not business-validated.
- [ ] Now that Make an Offer's UI is gone, decide whether to strip the dead `evaluateOffer`/`min_offer_accept_gbp` plumbing out entirely.
- [ ] The "Flipsta Sourced Deals" broker disclosure is a first-pass wording, not legal copy — worth a look alongside the rest of the T&Cs draft before real launch.
- [ ] Basket is client-side/localStorage only — doesn't sync across devices/browsers for a signed-in user.
- [ ] Wishlist "View in shop" routes through search rather than buying directly from the wishlist page.
- [ ] `REFERRAL_REWARD_GBP` must stay in sync with the hardcoded `reward_gbp := 5.00` in migration `0016`.
- [ ] `estimated_stock_units` on an opportunity doesn't decrement when someone Instant Wins multiple units.
- [ ] DPD/courier delivery-confirmation API — nothing built yet.
- [ ] Loyalty credit is awarded immediately at purchase, not gated behind delivery — first-pass choice, revisit if refund clawback ever matters at real volume (see #-5 above).
- [ ] The deal-drop notification job's size-match signal is a plain string match across whatever size field it lands on, not scoped by category — worth tightening with a proper category→size-type mapping if it turns out noisy in practice (see #-5 above).
- [ ] Recommendations score category-history + size matches with fixed weights (2/1) and no decay for stale history — fine as a first pass, worth revisiting once there's enough real usage to tell if it's surfacing the right things.
