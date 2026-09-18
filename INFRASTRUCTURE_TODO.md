# Infrastructure to-do

Everything here is something only you can do — account creation, payment
details, DNS you own. Nothing in this codebase calls out to any of these
services yet without the keys below being set, so it's safe to work through
this at your own pace before anything goes live.

## 1. Get the code onto GitHub

You said you already have GitHub — this codebase was built locally and was
deliberately **not** pushed anywhere, since doing that without asking first
would be publishing to your account without permission.

- [ ] Create a new (private, to start) repo in your GitHub account.
- [ ] From the unzipped project folder: `git remote add origin <your-repo-url>`, then `git push -u origin main`.

## 2. Supabase — the database

- [ ] Create a new Supabase project (or use an existing one, if you'd rather keep this separate from anything else on your account).
- [ ] In the SQL editor, run every migration **in order**: `0001_init.sql`, `0002_admin_ops.sql` (admin dashboard/tickets/partners/reviews/tax), `0003_cross_posting.sql` (multi-platform listing), `0004_auth_profile_trigger.sql` (auto-creates a profile on signup — sign-up won't work at all without this one), `0005_seller_order_visibility.sql` (lets a seller see their own sales), `0006_subscription_billing.sql` (Stripe subscription id, for self-serve tier upgrades — see section 3), `0007_channel_connections.sql` (stores each seller's connected marketplace accounts — see section 9) — then `supabase/seed.sql` for sample data to develop against.
- [ ] Auth → Settings: for testing, consider turning **off** "Confirm email" so a freshly signed-up test account can sign in immediately without clicking an email link. Turn it back on before real users sign up.
- [ ] Project Settings → API: copy the **Project URL** and **anon public key** → these become `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Same page: copy the **service_role key** (keep this one secret, server-only) → `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Auth → Providers: email/password is enabled by default, which is all the app currently uses. Add social logins later if you want them.
- [ ] Consider upgrading off the free tier before real user data is stored — the free tier pauses inactive projects and has no point-in-time backup.
- [ ] **To reach the admin dashboard:** after your own account has signed up once, open the Table Editor → `profiles`, find your row, and set `role` to `admin`. There's no self-service way to become staff — deliberately.

## 3. Stripe — payments & the escrow mechanic

- [ ] Create a Stripe account if you don't have one, and enable **Stripe Connect** (Dashboard → Connect → Get started). This is what lets sellers get paid out while you still control when funds release.
- [ ] Choose **Express** accounts for sellers (the standard choice for a marketplace like this — Stripe handles most of the onboarding UI for you).
- [ ] Dashboard → Developers → API keys: copy the **secret key** → `STRIPE_SECRET_KEY`. Use a *test mode* key until you're ready to take real payments.
- [ ] Dashboard → Developers → Webhooks: add an endpoint pointing at `https://<your-render-url>/api/webhooks/stripe`, listening for at least `payment_intent.succeeded`, `payment_intent.payment_failed`, `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted` (the last three power the self-serve tier upgrade flow below — without them, a paid upgrade would take payment but never actually change the account's tier). Copy the **signing secret** → `STRIPE_WEBHOOK_SECRET`.
- [ ] **For the `/upgrade` self-serve subscription flow:** Dashboard → Product catalogue → create one Product per paid tier (Standard, Pro, Elite) with a **recurring monthly Price** on each — the actual amount is your call (Section 7 of the planning doc has suggested ranges, but nothing in the code enforces those numbers, they're just the UI's display text). Copy each Price's ID (starts `price_...`) → `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ELITE` on the `flipsta-web` service.
- [ ] Also enable the **Customer Portal** (Dashboard → Settings → Billing → Customer portal) with its defaults — this is what powers the "Manage billing" button on `/upgrade` for existing subscribers.
- [ ] Later, before accepting real payments: Stripe will ask for business verification details (Companies House number, once Flipsta is registered — see the planning doc's next-steps note) and your UK bank account for payouts.

## 4. Render — deploying the app

- [ ] In the Render dashboard: New → Blueprint, point it at your GitHub repo. It will read `render.yaml` and propose two services: `flipsta-web` and `flipsta-worker`.
- [ ] For each service, fill in the environment variables marked `sync: false` in `render.yaml` using the values you collected above.
- [ ] Deploy. `flipsta-web` serves the site; `flipsta-worker` runs the background jobs (discovery, auction closing, escrow release) continuously.
- [ ] Once it's live, go back to Stripe and update the webhook URL to the real Render URL if you set it up before deploying.

## 5. Domain & DNS

- [ ] You already own flipsta.co.uk. Point it at Render: Render dashboard → your web service → Settings → Custom Domain, then add the CNAME/A record Render gives you at your domain registrar.
- [ ] Strongly recommend putting **Cloudflare** in front of it (free tier) once live — the research for this project already ran into eBay's bot-detection just from manual price checks; a real storefront will get scraped and probed from day one, and Cloudflare's free tier alone stops a lot of that.

## 6. Data sources for the AI discovery engine

The worker currently uses a mock data source (`apps/worker/src/adapters/mockAdapter.ts`) so the whole pipeline runs without any of this — do this when you're ready to find real deals.

- [ ] **This one's already wired and ready to flip on, no extra account needed:** the same `ANTHROPIC_API_KEY` set on the `flipsta-worker` Render service also drives real *discovery*, not just scoring. `apps/worker/src/adapters/claudeSearchAdapter.ts` uses Claude's own web search to find products currently on genuine discount/clearance, then searches a resale/second-hand site for what the same item actually sells for, so the margin is based on real evidence rather than a guess — this is the alternative to Keepa (below), built per Steven's request (24 Aug) rather than relying on Amazon pricing alone. `apps/worker/src/index.ts` picks this adapter automatically the moment the key is set (falls back to the mock adapter otherwise); it also switches the discovery interval from every 5 minutes (mock, free) to every 2 hours by default, since this one does real, billed web searches (~$10 per 1,000 searches, plus normal token cost) — override the cadence with `DISCOVERY_INTERVAL_MINUTES` on Render once you've seen real costs in the Anthropic console. Note this is not scraping and doesn't attempt to bypass any site's bot-detection — it only reads what an ordinary Claude web search already surfaces.
- [ ] Worth spot-checking the first several real runs: Render's worker logs print the resale-evidence URL Claude used to justify each accepted deal, so you can sanity-check a handful before trusting the pipeline unattended.
- [ ] Keepa API account (~£25-45+/month depending on plan — Section 9.1 of the business doc) is still an option if you'd rather have a dedicated, structured pricing-history data source for Amazon specifically → `KEEPA_API_KEY`, then implement `apps/worker/src/adapters/keepaAdapter.ts` (currently a labelled stub, unused now that the Claude-search adapter is wired in as the default real path). Not required — the Claude web-search adapter above is a genuine alternative, not a placeholder waiting for this.
- [ ] Retailer affiliate programmes (LEGO UK via Rakuten Advertising/FlexOffers, per Section 8.2) — sign up once you're ready to route purchases through tracked links. Separate from the Awin integration directly below — that one's about publisher commission on referred sales, this one's about Flipsta itself buying through a tracked link when it sources an opportunity; not built yet.
- [ ] **Awin affiliate integration (27 Aug 2026, Steven's own new revenue stream, separate from the core arbitrage business)** — fully built on Flipsta's side (`/partner-deals` public page, `/admin/partner-deals`, migration `0025`, `apps/worker/src/jobs/syncAwinProducts.ts`), inert until you complete these steps yourself (account creation needs your own business details — not something that can be done on your behalf). **Revised 1 Sept 2026** after the first real sync attempt against Steven's live account surfaced that step 3 below (the original guess) was wrong — see the note at the bottom.
  1. Sign up as an Awin publisher at [awin.com](https://www.awin.com) — free, no cost to just list products.
  2. Apply to join 2-3 merchant "programmes" relevant to Flipsta's categories (the confirmed pilot scope). Each merchant approves separately, usually within a few days.
  3. Generate your OAuth2 token at [ui.awin.com/awin-api](https://ui.awin.com/awin-api) (enter your account password, copy the token shown — Awin now labels it "OAuth2 token" but it's the same bearer token the API docs call an API token). Find your Publisher ID on your Awin account dashboard (shown under "Your Accounts", beneath the Flipsta account name/logo).
  4. Set `AWIN_API_TOKEN` (the OAuth2 token) and `AWIN_PUBLISHER_ID` on **both** `flipsta-web` (powers the admin programme picker at `/admin/partner-deals`, showing which merchants you're approved for) and `flipsta-worker` — already scaffolded in `render.yaml`, both `sync: false`.
  5. **The actual product download needs a third, separate value — `AWIN_FEED_URL`, worker-only.** In Awin's own UI, go to Tools → Create a Feed → "Configure an advertiser-based feed", add every merchant you want synced to that one feed, and generate/save it. Awin gives you back one long download URL containing its own API key (nothing to do with the OAuth2 token) — copy that whole URL and set it as `AWIN_FEED_URL` on `flipsta-worker` only.
  6. Once all three are set on the right services and redeployed: visit `/admin/partner-deals`, add your first 2-3 merchants to the pilot list (from the "approved programmes" list, powered by the OAuth2 token), and give the worker one sync cycle (every 6 hours, or restart the `flipsta-worker` service on Render to force an immediate one) to see products land on `/partner-deals`.
  - **Two-step process every time you add or remove a synced merchant**: (a) add/remove them inside Awin's own "Create a Feed" configuration (same feed URL — Awin just returns more or fewer merchants' rows), and (b) add/remove them in `/admin/partner-deals` on Flipsta. Miss step (a) and the worker logs will show that merchant under `advertisersMissingFromFeed` rather than silently showing 0 products, so it's easy to spot.
  - How it works: products stay listed on the merchant's own site — `/partner-deals` sends a shopper there via Awin's tracked link, Flipsta earns a commission on the sale, and never touches payment, shipping, or stock for these. The same real price data also feeds a "real price benchmark" signal into the AI discovery prompt (`claudeSearchAdapter.ts`) for whichever categories have enough synced products (3+) — Steven: "then you can use this info to help search better."
  - **What the "not independently verified yet" note above actually caught**: the original build assumed one endpoint (`productdata.awin.com/datafeed/list/apikey/{OAUTH2_TOKEN}`) could both discover and download every approved merchant's feed automatically, using the same OAuth2 token as the rest of the Publisher API. Against Steven's real account that endpoint returned a 500 every time. The actual, working mechanism turned out to be Awin's separate "Create a Feed" tool with its own distinct key (step 5 above) — confirmed against a real downloaded feed on 1 Sept 2026, including the exact column layout (`aw_deep_link`, `search_price`, `merchant_id`, `stock_status`, etc — matches what the parsing code already expected) and the gzip packaging. The code now reflects the verified real behaviour, not the original guess.
  - **A second feed URL, same day — only needed if a merchant is on Awin's "Enhanced" (Google Shopping) format.** Awin's Create-a-Feed tool refuses to combine "Legacy" (Awin's own format) and "Enhanced" merchants into one feed ("You can only select advertisers that use the same datafeed format") — MALOA (UK) turned out to be Enhanced-format. If you hit this: build a *second*, separate feed in Create-a-Feed containing only the Enhanced-format merchant(s), and set that URL as `AWIN_FEED_URL_2` on `flipsta-worker` (optional — leave unset if every merchant you're syncing is Legacy-format, which is the common case). Confirmed against MALOA's real downloaded file: it's a genuinely different column layout (Google Shopping field names — `id`, `link`, `image_link`, `availability`, `google_product_category` — instead of Awin's own `aw_product_id`/`merchant_deep_link`/`stock_status`/`category_name`), and the file itself starts with a UTF-8 byte-order-mark glued onto the first header cell that had to be stripped. The good news: Awin still injects its own tracked `aw_deep_link` into Enhanced-format feeds too, so commission tracking works identically either way — the parsing code now recognises both formats' column names side by side, verified against both real files (167/167 Legacy rows, 96/96 Enhanced rows).

## 7. Shipping

- [ ] DPD and Evri both require a business courier account to get real rates/labels via API — or use an aggregator like **Shippo** or **EasyPost**, which support UK couriers under one integration instead of separate contracts with each. Worth comparing before committing to either DPD or Evri directly.
- [ ] Set up the DPD affiliate programme (via the Shopper.com network) once you have real order volume, per Section 8.2.

## 8. Email

- [x] Done 18 Sept 2026 — Resend is live. See Section 21 for the full setup
      (domain, DNS, API key, welcome emails, and the new promo/broadcast
      feature) and Section 20/19 for the other 18 Sept work shipped
      alongside it.

## 9. Multi-platform listing — external marketplace accounts

There are two separate things here, easy to conflate: **Flipsta's own developer
registration** on each platform (this section, one-time, only you can do it —
account creation, business verification, agreeing to their API terms), and
**each seller's one-click "Connect account"** (already built — see
`/settings/connections`, `apps/web/lib/channelOAuth.ts` — a seller signs into
their own account on that platform and grants access, no API key ever shown
to them). The second only lights up once the first is done for a given
channel: with no credentials set, that channel's "Connect" button shows
"not connectable yet" instead of a broken flow.

- [ ] The channel list was updated (2026) to prioritise platforms with a real, documented, self-serve seller API — swapping out Amazon/Facebook Marketplace/Vinted in favour of Etsy/Whatnot/StockX, and correcting Depop's status (it now has an official API, where the original build assumed it didn't). Register Flipsta as a developer/app on each active channel, then set the matching env vars on `flipsta-web` (already scaffolded in `render.yaml`, all `sync: false`):
  - [ ] **eBay** — self-serve. Register an OAuth application at the eBay Developers Program (developer.ebay.com) → a Trading/Sell API app with an `sell.inventory` scope, giving you your App ID (Client ID) and Cert ID (Client Secret). **One extra eBay-specific step**, easy to miss: under Your Account > Application Keys > User Tokens, create a Redirect URL — eBay calls this an **RuName** — and set its "Auth Accepted URL" to `https://flipsta.co.uk/api/channel-connections/ebay/callback`. eBay's OAuth flow sends the RuName itself (not the URL) as its `redirect_uri` — 27 Aug 2026, caught live: the code originally sent the real callback URL for every channel including eBay, which eBay would have rejected; `channelOAuth.ts` now resolves eBay's RuName separately (see `usesRuNameAsRedirect`). Set all three on `flipsta-web`: `CHANNEL_EBAY_CLIENT_ID`, `CHANNEL_EBAY_CLIENT_SECRET`, `CHANNEL_EBAY_RUNAME`. 18 Sept 2026: **also set `CHANNEL_EBAY_CLIENT_ID` and `CHANNEL_EBAY_CLIENT_SECRET` (no RUNAME needed) on `flipsta-worker`** — its retry sweep (`jobs/crossPostListings.ts`) calls eBay's real Sell API directly too now (`packages/shared/src/ebayListing.ts`), not just the web app; both already scaffolded in `render.yaml`. Also, on eBay's own side: turn on **Business Policies** (Seller Hub → Account → Business Policies) with at least one payment/return/postage policy — eBay's Offer API rejects a publish without them, and this is a one-time thing done on eBay directly, not something Flipsta sets up on a seller's behalf.
  - [ ] **Etsy** — self-serve, but only via a **Personal App**, not a Seller App (Seller Apps only ever authorize the single shop that creates them — Flipsta needs each of its own sellers to connect their own separate shop). Register one at developers.etsy.com, note down its Keystring, then click **Request Commercial Access** on that same app so it works for sellers other than yourself (Etsy reviews this manually, separately from the initial app approval). Set `CHANNEL_ETSY_CLIENT_ID` only — Etsy's flow is PKCE-based and doesn't use a client secret. Authorize/token URLs are already built in.
  - [ ] **Depop** — gated. Email Depop's Partner API team (partnerapi.depop.com) to request access; they'll issue a client id/secret and give you your specific authorize/token URLs (these aren't publicly published — they're issued per partner). Set all four: `CHANNEL_DEPOP_CLIENT_ID`, `_CLIENT_SECRET`, `_AUTHORIZE_URL`, `_TOKEN_URL`.
  - [ ] **Whatnot** — gated. Contact Whatnot's developer team to register a client app and your redirect URI (`https://<your-render-url>/api/channel-connections/whatnot/callback`); they generate the secret and give you the endpoint URLs. Set all four: `CHANNEL_WHATNOT_CLIENT_ID`, `_CLIENT_SECRET`, `_AUTHORIZE_URL`, `_TOKEN_URL`.
  - [ ] **StockX** — gated, application/review process via the StockX Developer Portal, and their OAuth pages sit behind PerimeterX bot-detection (a reason to budget more lead time here, not to script around it — see the note below). Once approved, confirm the exact flow with StockX and set all four: `CHANNEL_STOCKX_CLIENT_ID`, `_CLIENT_SECRET`, `_AUTHORIZE_URL`, `_TOKEN_URL`.
  - [ ] Deprioritised, kept in mind for later rather than built against now:
    - **Amazon** — Amazon Selling Partner API access exists, but requires an active Amazon seller account first, and Amazon is often not the cheapest source anyway (worth revisiting only if there's a specific business reason to add it back).
    - **Vinted** — still no public seller API as of this document; a real integration would need a direct partnership conversation with Vinted.
    - **Facebook Marketplace** — Meta Commerce/Catalog API access exists via a Meta Business account, but was deprioritised in favour of the channels above.
- [ ] For each channel, once its developer credentials are set, register `https://<your-render-url>/api/channel-connections/<channel>/callback` as that platform's OAuth redirect URI in their developer settings — most platforms reject the login if this doesn't match exactly.
- [ ] Run `supabase/migrations/0007_channel_connections.sql` — this is what stores each seller's connected account.
- [ ] None of this blocks launch, and nothing here requires all five channels — set up one (Etsy is the simplest self-serve option) and the rest can follow later. Even once a seller is connected, the actual "create a listing on their behalf" API call to each platform is a separate piece of work from connecting the account — 18 Sept 2026: **eBay's is now real** (`packages/shared/src/ebayListing.ts`, wired into `publishListingToChannel()` in `salesChannels.ts`), untested against a live account until the env vars above are set and a seller actually connects. Depop/Etsy/Whatnot/StockX are still the original labelled stub.
- [ ] **On bot-detection generally:** several of these platforms (StockX in particular) actively gate automated access with bot-detection (PerimeterX and similar). The right response to that is the official API + application process above, or a paid data/API provider — never scripting around the gate itself; that's a real legal/ToS risk and not something built here.

## 10. Monitoring (do this before launch, not after an incident)

- [ ] **Sentry** — free tier is enough to start; catches errors from both the web app and the worker.
- [ ] Render's built-in logs are fine initially; revisit if you need longer retention or full-text log search.

## 11. Legal / compliance (carried over from the planning doc — still outstanding)

- [ ] UK trademark search via the IPO before public launch (flagged when the Flipsta name was chosen).
- [ ] Register "Flipsta" at Companies House if not already done.
- [ ] A UK financial services solicitor's review before Version 1 (the short-selling exchange) ever goes live — Section 3.1 flags a real FCA risk around forward-contract regulation.
- [ ] The draft Terms & Conditions in `legal/terms-and-conditions-draft.md` (Section 12.7) needs a solicitor's review before publishing, alongside a Privacy Policy, Cookie Policy, and Seller Agreement — none of which exist yet.

## 12. Social login (Google, Facebook, Apple)

27 Aug 2026, Steven: "need to have users be able to login with google,
facebook and apple." The app side is fully built — `/login` and `/signup`
both show "or continue with" buttons (`SocialAuthButtons.tsx`), and
`api/auth/callback/route.ts` handles the redirect back from each provider.
**None of this needs a new env var on Render** — unlike Stripe/Awin/the
channel OAuth in Section 9, provider credentials for this live entirely in
the Supabase dashboard, not in your app's own config.

- [ ] **Turn providers on in Supabase first:** Dashboard → Authentication →
      Providers. Each of Google/Facebook/Apple has a toggle plus a Client
      ID / Client Secret pair to fill in — and each one shows you the exact
      **Callback URL** to register with that provider (it'll look like
      `https://<your-project-ref>.supabase.co/auth/v1/callback` — this is
      Supabase's own callback, separate from and in addition to our app's
      `/api/auth/callback`, which only runs after Supabase has already
      finished the provider handshake).
- [ ] **Google** — simplest of the three, self-serve, free. Google Cloud
      Console → APIs & Services → Credentials → Create OAuth client ID
      (Web application). Add the Supabase callback URL above under
      "Authorized redirect URIs." Copy the Client ID/Secret into Supabase.
      You'll also fill in an OAuth consent screen (app name, support email,
      logo) — this can start in "Testing" mode for now and doesn't need
      Google's full verification review until you have real volume.
- [ ] **Facebook** — self-serve, free. developers.facebook.com → create an
      app (type: Consumer) → add the "Facebook Login" product → Settings →
      add the Supabase callback URL under "Valid OAuth Redirect URIs."
      Copy the App ID/Secret into Supabase. Like Google, this can run in
      development mode for testing before Facebook's app review is needed.
- [ ] **Apple** — the one with real upfront cost and friction: requires an
      active Apple Developer Program membership ($99/year) even before you
      can configure anything. In developer.apple.com → Certificates,
      Identifiers & Profiles, register a Services ID (this is what acts as
      the "Sign in with Apple" client), enable Sign in with Apple on it, and
      register the Supabase callback URL as its return URL. Apple also
      requires generating a private key and a signed client secret (a JWT,
      regenerated periodically — Supabase's own Apple provider docs walk
      through this exact step, worth following directly from their site
      since Apple's requirements here shift periodically). Given the cost
      and setup time, it's reasonable to ship Google + Facebook first and
      add Apple once there's a real reason to prioritise it (e.g. iOS users
      specifically asking for it).
- [ ] Run `supabase/migrations/0026_social_login.sql` — without it, a
      Google/Facebook sign-up will still work but show as a generic email
      prefix ("steven" rather than "Steven Smith") for display name, and the
      referral-code pass-through (`/signup?ref=CODE`) silently won't credit
      OAuth sign-ups at all.
- [ ] Nothing here is required for launch — email/password sign-in (already
      live) works completely on its own. Turn a provider on whenever you're
      ready; until then, that provider's button just returns an error and
      the user lands back on `/login` with a message, no broken flow.
- [ ] Seller tax reporting (Section 12.6) — the `seller_tax_info` schema and `isHmrcReportableSeller()` check exist, but confirm the current HMRC digital platform reporting thresholds/deadlines with an accountant before the onboarding UI (still to be built — see STATUS.md) goes live.

## 13. Live selling — Cloudflare Stream + the internal API secret

27 Aug 2026, Steven: "i would like to be able to offer my resellers the
oppotunity to do live selling via my site. a bit like QVC... i think
whatnot does this already." Real video streaming (Steven's confirmed
answer, not a virtual/chat-only event) via **Cloudflare Stream**, chosen
specifically because it lets a host broadcast straight from their own
browser tab/camera (WHIP) with no OBS or any other software to install —
see `apps/web/lib/cloudflareStream.ts`. Any approved reseller can host
(Steven's confirmed answer) via `/live/new`; anyone can watch at `/live`,
no sign-in needed; bidding/buying/chat needs an account.

- [ ] **Create a Cloudflare account** if you don't already have one
      (cloudflare.com — free to sign up; Stream itself is pay-as-you-go, no
      monthly minimum: roughly £4/1,000 minutes stored + £0.80/1,000
      minutes watched at today's exchange rate, converted from Cloudflare's
      USD pricing — cheap to trial with a handful of test shows).
- [ ] **Enable Stream** on the account — Cloudflare dashboard → Stream (it
      will ask you to add a payment method even on the pay-as-you-go tier).
- [ ] **CLOUDFLARE_STREAM_ACCOUNT_ID** — your Account ID, shown on the right
      side of almost any page in the Cloudflare dashboard once you've
      selected your account.
- [ ] **CLOUDFLARE_STREAM_API_TOKEN** — dashboard → My Profile → API Tokens
      → Create Token. Use the "Edit Cloudflare Stream" template (or a
      custom token scoped to Account → Stream → Edit) — this is what lets
      Flipsta create a new Live Input every time a reseller schedules a
      show.
- [ ] **CLOUDFLARE_STREAM_CUSTOMER_CODE** — shown on the Stream dashboard's
      overview page (sometimes labelled "customer subdomain" — it's the
      short code in `https://customer-<CODE>.cloudflarestream.com/...`,
      used to build every viewer's playback URL).
- [ ] Set all three on **flipsta-web only** (not the worker — video
      creation/playback both happen web-side).
- [ ] **INTERNAL_API_SECRET** — a new one, needed on **both** flipsta-web
      and flipsta-worker, and it must be the **exact same value** on both.
      This is what lets the worker's `closeExpiredLiveItems.ts` job call
      flipsta-web's own `/api/internal/live-shows/settle-item` route to
      actually create the order when a live auction's clock runs out
      (keeps Stripe's SDK/keys living only in the web app, same reasoning
      already noted — but never actually wired up — in
      `releaseEscrow.ts`'s comments). Generate any long random string for
      this, e.g. run `openssl rand -hex 32` in a terminal, or use any
      password generator for a 40+ character string — paste the SAME value
      into both services' Render environment tabs.
- [ ] `WEB_APP_INTERNAL_URL` is already set for you in `render.yaml`
      (`https://flipsta.co.uk`) — nothing to fill in there.
- [ ] Until `INTERNAL_API_SECRET` and the three Cloudflare vars are all set,
      "Schedule a show" on `/live/new` will show a clear "not set up yet"
      message rather than failing confusingly — nothing breaks by leaving
      this for later, same as every other optional integration in this doc.
- [ ] Run `supabase/migrations/0027_live_selling_and_grants.sql` and
      `0028_orders_rls_gaps.sql` (the second one fixes two real, pre-existing
      bugs found while building this — see that migration's own comments
      for the full detail — worth reading, it likely means loyalty credit
      hasn't actually been awarded to any real buyer yet).
- [ ] The host's "Start broadcasting" button
      (`apps/web/app/live/[id]/page.tsx`) uses the browser's own WebRTC/WHIP
      APIs directly — no library, following Cloudflare's own documented WHIP
      flow — but this hasn't been exercised against a real Cloudflare
      account yet (no live credentials in the environment this was built
      in). Worth a real test broadcast (even solo, to yourself) the first
      time this runs for real, before relying on it for an actual show.

## 14. Live-show multicast — no new setup needed on your side

28 Aug 2026, Steven: "This needs to be cast across all connected platforms
reaching everywhere at once." Multicast (also pushing a Flipsta broadcast
out to YouTube/Facebook/Instagram/TikTok/a custom RTMP target at the same
time) reuses the exact same `CLOUDFLARE_STREAM_ACCOUNT_ID`/
`CLOUDFLARE_STREAM_API_TOKEN` already set up in Section 13 above —
Cloudflare's Outputs API just needs the destination's own RTMP URL and
stream key, which the **host** supplies per show (a new "Also broadcast
to" section on the show's host controls) rather than anything you need to
configure globally.

- [ ] Nothing for you to set up here — this is a per-show, per-host thing,
      not a platform-wide credential.
- [ ] Each host gets their own RTMP URL + stream key from whichever
      platform they want to also cast to, from that platform's own "go
      live" page (e.g. YouTube Studio → Go Live → Stream Key; Facebook's
      Live Producer). Flipsta prefills YouTube's and Facebook's standard
      RTMP endpoint — the host only needs to paste in their own stream key.
- [ ] **eBay Live and Whatnot are NOT available as multicast destinations**
      — confirmed directly against both platforms' own official docs:
      neither has any public API or mechanism for a third party (Flipsta
      included) to push a stream in. eBay Live only broadcasts through
      eBay's own mobile app; Whatnot's stream-key flow is for Whatnot's own
      hosts only, and its own "multicast" feature pushes the opposite
      direction (out from Whatnot, not in). This is a hard technical
      limitation on their side, not something Flipsta can build around.

## 15. Signup bot protection — Cloudflare Turnstile

18 Sept 2026, Steven: "need to protect from bots making accounts also."
Two parts to this — one code change (already done) and one dashboard
step only you can do.

- [ ] **Create a Turnstile site** — dash.cloudflare.com → Turnstile → Add
      site. Free, no Google account needed (unlike reCAPTCHA). Add
      `flipsta.co.uk` (and `localhost` if you want it working in local
      dev) as the domain. This gives you a **Site Key** and a **Secret
      Key**.
- [ ] Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (the Site Key) on the
      `flipsta-web` service on Render. Until this is set, the widget on
      `/signup` just doesn't render and signup works exactly as before —
      nothing breaks by leaving this for later.
- [ ] **The Secret Key goes into Supabase, not into this app**: Supabase
      Dashboard → Authentication → Attack Protection → enable "Enable
      Captcha protection," choose Cloudflare Turnstile, paste the Secret
      Key. This is the step that actually matters — the widget on the
      page alone only stops naive scripted form submissions; this toggle
      is what makes Supabase's own Auth API reject a signup that skips
      the widget entirely (e.g. a bot calling the API directly with the
      public anon key, bypassing the page altogether).
- [ ] Run `supabase/migrations/0030_signup_profile_details.sql` — adds
      the address/business/date-of-birth fields the redesigned `/signup`
      form now collects, and enforces the 16+ minimum as a DB check
      constraint (so it can't be bypassed the same way).
- [ ] Google/Facebook/Apple signup (Section 12) goes through Supabase's
      OAuth flow directly, which isn't covered by Turnstile the same way
      — Supabase's Attack Protection settings have their own separate
      rate-limiting for that, on by default.

## 16. Flippy Coins shop

- [ ] Run `supabase/migrations/0031_flippy_coins.sql` — adds the real
      Flippy Coin balance/ledger (`profiles.flippy_coin_balance`,
      `coin_transactions`) that `/coins` now actually charges into and
      the header balance reads from. Without this, buying coins will
      fail server-side rather than silently doing nothing.
- [ ] Nothing new to add in Stripe or on Render — this reuses
      `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` from Section 3, and
      `checkout.session.completed` (which credits a purchase) is already
      on the list of events that section asks you to subscribe the
      webhook endpoint to. Just double check that event is actually
      ticked on the webhook endpoint in the Stripe dashboard if coin
      purchases ever don't land.
- [ ] Per-tier discounted coin pricing, spending coins to unlock an
      opportunity, the free trial/daily bonus, and the Flippy mascot's
      random reward are all still open decisions in
      `planning/coin-economy-proposal.md` — not built as part of this;
      the shop only sells coins and holds a balance for now.

## 17. Merch shop (t-shirts, caps, and other items)

- [ ] Run `supabase/migrations/0032_merch_orders.sql` — adds
      `merch_orders`, the table `/merch` checkout and the Stripe webhook
      write real paid orders into, and that `/admin/merch-orders` reads
      from. Without this, a merch purchase will still take payment via
      Stripe but the order will have nowhere to land.
- [ ] Nothing new to add in Stripe or on Render — same as Section 16,
      this reuses `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` and the
      existing `checkout.session.completed` webhook subscription from
      Section 3.
- [ ] **Confirm real pricing** in `packages/shared/src/constants.ts`
      (`MERCH_ITEMS`) before going live — the five items now use your own
      real product photos (`apps/web/public/merch/*.jpg`: mug, tote bag,
      black hoodie, black cap, white t-shirt), but the `priceGBP` values
      are still the original placeholders carried over from before the
      photos arrived, since no real pricing has come through yet.
- [ ] Only these five items are listed — no black t-shirt or gold cap
      (photographed cap is black/gold-trim, not solid gold) since there's
      no photo for those. Add more items to `MERCH_ITEMS` with their own
      `imageUrl` under `public/merch/` if you want a bigger range.
- [ ] Shipping is UK-only (`shipping_address_collection: { allowed_countries: ["GB"] }`
      in `lib/stripe.ts`'s `createMerchCheckoutSession`) at a flat
      `MERCH_SHIPPING_GBP` per order — widen the countries list or add
      per-item shipping rates if you sell outside the UK.
- [ ] Fulfil orders from `/admin/merch-orders` — mark an order "shipped"
      once it's packed and posted. There's no shipping-label integration
      or automatic customer notification on shipment yet; both are still
      manual.

## 18. AliExpress dropship (18 Sept 2026)

Steven: "add ali express products and add them into our shop with a 25%
markup and when someone orders it then a dropship order is created." Who
fulfils: "Just you / staff" (Steven's own answer).

- [ ] Run `supabase/migrations/0033_dropship_products.sql` — adds
      `dropship_products` (the catalogue) and `dropship_orders` (the paid
      orders `/admin/dropship-orders` reads from). Without this, a
      dropship purchase would still take payment via Stripe but have
      nowhere to land.
- [ ] Nothing new to add in Stripe or on Render — reuses
      `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` and the existing
      `checkout.session.completed` webhook, same as Sections 16 and 17.
- [ ] **This is deliberately admin-entered, not an automated feed sync.**
      Real research this session found two hard constraints: (1)
      AliExpress's Affiliate/Dropshipping APIs need their own
      developer-portal signup and approval — the same kind of external
      gate you already hit with eBay and Etsy — and even the Affiliate
      API has no reliable way to pull full product descriptions; (2) per
      DSers' own official help docs (DSers being AliExpress's own
      sanctioned dropshipping tool), paying for an AliExpress order can
      never be automated by anyone, including DSers itself — a human
      always has to go to AliExpress's own checkout and click "Pay now."
      So automating the import wouldn't actually remove the one manual
      step that matters (placing and paying for the order) — it would
      just add a second external approval wait for little benefit. If you
      later do get AliExpress API approval and want a real feed sync
      anyway, mirror `apps/worker/src/jobs/syncAwinProducts.ts` — the
      table shapes here were designed to slot a sync job in without
      changes.
- [ ] **To add a product:** go to `/admin/dropship-products`, paste the
      AliExpress product page URL, and fill in the title, photo, and
      AliExpress's current price — the 25% markup price is suggested
      automatically (`packages/shared`'s `computeDropshipPriceGBP`) but
      you can override it per item. It then appears on `/shop`'s
      "AliExpress Finds" section immediately.
- [ ] **To fulfil an order:** once a customer pays, it lands in
      `/admin/dropship-orders`. Copy the shipping address shown, go place
      and pay for that same item on AliExpress yourself using that
      address, then mark it "Ordered" (optionally noting AliExpress's own
      order id) — and "Shipped" once AliExpress gives you tracking.
- [ ] Shipping is UK-only, same as merch, and defaults to £0
      (`DROPSHIP_SHIPPING_GBP` in `packages/shared/src/constants.ts`)
      since most AliExpress listings already bake shipping into their
      price — raise it if a particular product needs it.
- [ ] No customer-facing delivery estimate beyond the fixed 2-4 week note
      on `/shop` — AliExpress shipping times vary a lot by item and
      supplier, so don't promise a tighter window without checking the
      specific listing first.

## 19. Friend-invite signup coins, fixed-price deals, and post-sale share reward (18 Sept 2026)

Steven, in one message, asked for three things: (1) "when people sign up
and fill in there details we ask for their friends email and name etc and
then give them an extra 5 coins for the effort and then when their friend
signs up they both get 15 coins each"; (2) "we are moving away from the bid
and instant win on the site... a finite deal found with limited stock we
are offering to one person, do the math to work out the price... if there
is a good supply chain work out the amount of people we can offer this to
so they all make a good profit. say 10 and then if sales are booming then
release to another 10... get rid of bidding and have a fixed price. Dont
make it too cheap. we want someone on pro to get a good few deals a month.
the idea is they will topup coins once they run out"; (3) "when someone
make profit from a sale then it shoudl ask them to share it to social
media, they get a free coin for sharing to social media or whatever you
think is the right amount." All three shipped together in migrations 0034
and 0035.

**Friend invites (separate from the existing £5/£5 referral-link program):**
- [ ] New optional "Friend's name" / "Friend's email" fields on `/signup`.
      Filling them in credits the new signer +5 coins immediately
      (`FRIEND_INVITE_EFFORT_BONUS_COINS`) and records a `friend_invites`
      row. When someone later signs up with that exact email, both the
      original inviter and the new friend get +15 coins each
      (`FRIEND_INVITE_SIGNUP_BONUS_COINS`) — all inside `handle_new_user()`
      (migration 0034), same trigger that's always handled signup bonuses.
      This is deliberately a second, parallel system to the existing GBP
      `referral_code`/link program on `/referrals` — that one is unchanged
      and still pays out in £; this one pays in Flippy Coins and is keyed
      off an email match rather than a link click. `/referrals` now shows
      both.
- [ ] There's no reminder or nudge if the invited friend never signs up —
      the `friend_invites` row just sits at `status = 'pending'` forever.
      Consider an email nudge job if this needs pushing harder.

**Fixed-price limited-allocation deals (bidding retired for new deals):**
- [ ] Every *newly discovered* opportunity now gets `pricing_mode =
      'fixed_price'` instead of the old auction (`starting_bid_gbp` +
      `action_clock_expires_at` + `bids`) or instant-win-only flow —
      changed in `discoverOpportunities.ts`. There's no bidding UI left on
      a new deal at all: it's a straight "buy your slot" purchase for
      `fixed_price_coins`, paid entirely in Flippy Coins via the new
      `buy_deal_slot()` RPC (migration 0034/0035).
- [ ] **Price math** (`calculateFixedDealPriceCoins`,
      `packages/shared/src/pricing.ts`): takes the deal's expected margin
      in £ and the discovery engine's confidence score, and prices the
      slot at 50–65% of that margin (`FIXED_PRICE_PCT_OF_MARGIN`) — higher
      confidence prices closer to 65%. Floored at
      `FIXED_PRICE_MIN_COINS` (10 coins) so nothing is ever "too cheap,"
      per Steven's instruction. 1 coin = £1 throughout, same peg as
      everywhere else in the coin economy.
- [ ] **Batch sizing** (`calculateDealBatchSize`, same file): the first
      batch offered is `min(estimated stock, DEAL_DEFAULT_BATCH_SIZE)` —
      10 by default, exactly Steven's own example ("say 10"). `per_customer_cap`
      is hard-set to 1 slot per person per deal.
- [ ] **Buying a slot:** `POST /api/opportunities/:id/buy-slot` → the
      `buy_deal_slot(p_opportunity_id, p_profile_id)` SECURITY DEFINER
      function. It row-locks the opportunity (`for update`), checks
      pricing mode/status/capacity/no-duplicate-purchase, debits coins via
      the existing `credit_flippy_coins` ledger function (kind='spend'),
      inserts into the new `opportunity_slot_purchases` table, and flips
      the opportunity to `sold_out` the instant the batch fills. This is
      the **first time an opportunity purchase has ever actually collected
      payment** — the old bid/instant-win flow never charged anything at
      all (a pre-existing gap noted earlier in this file). A successful
      buy auto-lists the resulting item via the existing
      `autoListWonOpportunity()` (same fully-automatic behaviour the old
      instant-win path had) and awards loyalty credit via the existing
      `awardLoyaltyCredit()`.
- [ ] **"if sales are booming then release to another 10":**
      `evaluateBatchRelisting.ts` (previously an unused placeholder,
      genuinely wired up now) runs on its existing 10-minute worker
      schedule, looks at real sell-through in `opportunity_slot_purchases`
      for each live/sold-out fixed-price deal, and — via the pre-existing
      `shouldOpenNextBatch()` helper — opens another batch of 10 units
      when the previous batch sold well, capped by the existing
      `CONCENTRATION_CAPS.perOpportunityAggregateGuaranteedValueGBP`
      (£10,000 total exposure per opportunity) so this can't grow
      unbounded. "Always gathering data for the bot to learn" is preserved
      unchanged — `discoverOpportunities.ts`'s dedup/scoring logic is
      untouched, only what happens after a deal is found changed.
- [ ] Auction bidding code (`bids` table, `/api/opportunities/:id/bid`,
      the bidding UI) is **not deleted** — only new opportunities stop
      using it. Any already-live auction-mode opportunity from before this
      change keeps working the old way until it resolves. If you want to
      fully retire bidding, that's a separate follow-up (kill the bid
      route, migrate remaining live auctions, drop the UI).
- [ ] Security note: the first version of `buy_deal_slot()` (migration
      0034) had a real bug — its "is this really you" check used a plain
      `<>` against `auth.uid()`, which is NULL for an unauthenticated
      caller and made the whole check silently no-op for `anon`. Caught
      via `mcp__Supabase__get_advisors` right after applying 0034, fixed in
      migration 0035 with a null-safe `IS DISTINCT FROM` check plus an
      explicit `revoke ... from anon` (Supabase auto-grants `anon` EXECUTE
      on every new function by default, which a plain `revoke from
      public` doesn't touch). If you ever add another SECURITY DEFINER
      function with an identity check like this, use `IS DISTINCT FROM`,
      not `<>`/`=`, and run the security advisor afterwards.

**Post-sale social-share coin reward:**
- [ ] "Made profit from a sale" = the moment an order's escrow actually
      releases (`orders.funds_released_at`, set by
      `apps/worker/src/jobs/releaseEscrow.ts` — same moment the seller's
      net payout lands in their wallet). From that point, `/portfolio`'s
      "My sales" table shows a "Share" action for that order.
- [ ] `POST /api/orders/:id/share-reward` credits `SOCIAL_SHARE_REWARD_COINS`
      (2 coins — Steven left the amount to my judgement: "or whatever you
      think is the right amount"; 2 felt like enough to be worth doing
      without making sharing itself a meaningful income source) via
      `credit_flippy_coins`, and sets
      `orders.profit_share_reward_claimed_at` so it can only be claimed
      once per order.
- [ ] There's no verification that the seller actually shared anywhere —
      same honesty-based pattern as everything else that self-reports an
      action for a small reward on this platform. If abuse ever shows up,
      add a share-destination picker or a confirmation step before
      crediting.
- [ ] No unit tests were added for `calculateFixedDealPriceCoins` /
      `calculateDealBatchSize` yet, even though the sibling (now-retired)
      auction pricing functions have coverage in
      `packages/shared/src/pricing.test.ts`. Worth adding if this pricing
      formula gets tuned later.

## 20. TikTok trend signals for the discovery bot (18 Sept 2026)

Steven asked what's hottest on TikTok right now, then: "yes add this to make
the bot clever."

- [ ] New `trending_signals` table (migration 0036) — same admin-editable
      shape as `discovery_focus`/`seasonal_events` (Section 9's calendar):
      a keyword, which category slug(s) it applies to (blank = all), a free-
      text note, a source label, and an **expiry date that's required on
      every row**. That's the one deliberate difference from the seasonal
      calendar: Halloween is a fixed date everyone already knows is coming,
      but a TikTok trend can appear and fade within weeks, so a stale row
      needs to fall out of the AI's prompt on its own rather than needing a
      separate cleanup job.
- [ ] Manage it at `/admin/trending` (mirrors `/admin/seasonal`'s UI) or via
      `POST /api/admin/trending-signals` — staff-only, same RLS pattern
      (enabled, no policy, service-role/worker only).
- [ ] `discoverOpportunities.ts`'s `loadDiscoveryContext` reads every
      currently-unexpired row into `DiscoveryContext.trendingSignals`, and
      `claudeSearchAdapter.ts`'s `buildContextSections` turns matching ones
      into a "TIKTOK TREND SIGNAL" section in the search prompt — same
      treatment as the seasonal-priority and admin-focus-note sections
      already there. This never lowers the bar: a trending item still needs
      a genuine discount and real resale evidence to become an opportunity,
      it's just told what's worth actively looking harder for.
- [ ] There's no live TikTok API integration — none exists that fits this
      use case, and none was asked for. Rows are added from real research
      (web search) via `/admin/trending`, same as the four seeded on 18
      Sept 2026 (real, sourced figures, not invented): Medicube's PDRN Pink
      Collagen Volume Multi Balm (`beauty` — named TikTok Shop's single
      best-selling product overall in July 2026), SEESE's cordless
      pressure washer (`home-kitchen` — $1.97m in July 2026), ADDWIN's
      Fascia Ring massage device (`tech`/`beauty` — $1.78m in July 2026 at
      $22.39/unit), and Momcozy's electric baby nail trimmer (`baby-kids`
      — currently #1 in the UK). All four expire 21 days after being
      added — **revisit `/admin/trending` periodically and refresh what's
      actually still hot**, or this quietly goes back to having no trend
      signal at all once they lapse.

## 21. Resend email — welcome emails and promo broadcasts (18 Sept 2026)

Steven: "i need to setup resend so it can send emails for sign ups and promo
stuff." + "i already have an account as using it for another project"
(PSO Installations, `psoinstallationsltd.co.uk` — confirmed the same Resend
account, a separate verified domain there).

- [x] **Domain.** `flipsta.co.uk` added in Resend, region Ireland
      (eu-west-1). Resend auto-detected the DNS host as **Namecheap** and
      offered a direct link there — used it to add the DKIM (TXT,
      `resend._domainkey`), SPF (two CNAMEs, `rsend`/`send`), and DMARC
      (TXT, `_dmarc`, `p=none`) records alongside the existing `@`/`www`/
      `privateemail._domainkey` records, which were left untouched.
      "Enable Receiving" (an MX record) was left off — not asked for, only
      sending. Verification is DNS-propagation-dependent (Resend's own
      estimate: "a few hours") — check `/domains` on Resend; status was
      still "Pending" right after adding the records, which is normal.
- [x] **API key.** Created a new key scoped to **Sending access only**
      (not Full access — this app only ever calls the send endpoint) named
      `flipsta-production`. Couldn't scope it to the `flipsta.co.uk` domain
      specifically because that domain wasn't selectable in the scope
      dropdown yet at creation time (still pending verification) — it's
      currently usable against any domain on the account, including the
      PSO one. Worth tightening once `flipsta.co.uk` verifies: Resend →
      API keys → this key → check whether it can be re-scoped, or delete
      and recreate it once the domain dropdown offers it.
- [x] **Render.** `RESEND_API_KEY` and `NOTIFICATIONS_FROM_EMAIL` (`Flipsta
      <notifications@flipsta.co.uk>`) set on both `flipsta-web` and
      `flipsta-worker`. Both auto-redeployed to pick them up. Until DNS
      verification finishes, `packages/shared/src/notifications.ts`'s real
      Resend call will get rejected (unverified domain) and log an error —
      that stops on its own once `/domains` shows Verified, no action
      needed.
- [x] **Welcome email.** Signup itself is a client-side
      `supabase.auth.signUp()` call with no server hook Flipsta controls —
      the actual send happens from a new periodic worker job,
      `sendWelcomeEmails.ts`, same "worker polls for what's unhandled and
      sends" pattern as `notifyDealMatches.ts`. `profiles.welcome_email_
      sent_at` (migration 0037) is the idempotency marker, checked every 5
      minutes. `NotificationEvents.welcome` in `notifications.ts` is the
      template — deliberately separate from Supabase Auth's own "confirm
      your email" message.
- [x] **Promo/marketing emails.** New `/admin/broadcasts` page: staff write
      a subject + body, pick an audience ("Opted-in only" — the default,
      respects the new `notify_promotions` account toggle at `/account`,
      same on-by-default/one-click-off pattern as deal-match
      notifications — or "Everyone", an explicit override for e.g. a
      mandatory announcement), and hit send. That queues a `pending` row in
      `promo_broadcasts` (migration 0037); a new worker job,
      `sendPromoBroadcasts.ts`, picks it up within 5 minutes and does the
      actual sending — kept out of the API route so emailing a whole user
      base can't time out a web request. `/admin/broadcasts` shows status
      (Pending → Sending → Sent/Failed) and recipient count once sent, and
      a still-pending broadcast can be cancelled.
- [ ] **Not built:** Resend's own native Broadcasts/Audience feature was
      considered instead of the custom `/admin/broadcasts` page, but the
      custom route keeps everything staff-facing inside Flipsta's own admin
      panel (consistent with every other admin feature) and ties audience
      selection to the real `profiles`/`notify_promotions` data rather than
      a separately-maintained Resend contact list. Revisit only if the
      volume/sophistication of promo email ever outgrows a plain-text
      subject+body broadcast (templates, segments, A/B, etc. — all things
      Resend's own Broadcasts tool would give for free).

---

**Suggested order:** 1 → 2 → 4 (deploy with the mock worker adapter and Stripe
in stub mode, so you can see the real site running before spending anything)
→ 3 → 5 → the rest as you need them.
