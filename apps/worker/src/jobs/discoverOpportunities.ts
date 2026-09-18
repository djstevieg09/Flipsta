import {
  actionClockSeconds,
  calculateDealBatchSize,
  calculateFixedDealPriceCoins,
  classifyUrgencyTier,
  computeShopPricing,
  getMarketplaceCommissionRate,
  MIN_NET_ROI_PCT,
  NET_ROI_SHIPPING_ESTIMATE_GBP,
  qualifiesForShop,
  SHOP_ITEM_MAX_UNITS_LISTED,
} from "@flipsta/shared";
import { createDb } from "../db.js";
import { CandidateDeal, DiscoveryBatch, DiscoveryContext, ShopCandidate, SourceAdapter } from "../adapters/sourceAdapter.js";
import { scoreOpportunity } from "../aiScoring.js";

// 26 Aug 2026, Steven: "is the AI learning what its found... needs to be
// learning what its already found and not search over old ground" +
// "chosse what the AI should focus on when finding deals" + the seasonal
// calendar ask. Loose normalization (lowercase, collapsed whitespace) is
// deliberate — the goal is catching "Nike Air Max 90" vs "nike air max 90 "
// as the same product, not a strict dedupe key; a genuinely different
// product with a similar name is an acceptable rare miss here, favouring
// simplicity over a fuzzy-match library for a first pass.
function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const RECENT_HISTORY_DAYS = 30;

// 26 Aug 2026, Steven: "leanr over time what sells well and not." A wider
// window than RECENT_HISTORY_DAYS's dedup lookback — a real sell-through
// signal needs more data points than "don't repeat this exact product"
// does, and shop_items in particular can sit for a while before selling,
// so 30 days alone would under-count genuine recent sales.
const PERFORMANCE_WINDOW_DAYS = 45;
// Below this many recent rows in a category, a sell-through/win-rate
// percentage is more noise than signal — that category just gets no
// performance note at all rather than a misleading one built off 2 data
// points. Sourced from the same 26 Aug 2026 research as the thresholds
// below (industry sell-through-rate guides consistently only trust the
// metric once there's a real sample to compute it from).
const MIN_SAMPLE_SIZE = 5;
// Real retail sell-through-rate benchmarks (researched 26 Aug 2026 —
// industry inventory-management guides): ~70%+ sold is considered a strong
// performer, under ~35% signals real trouble and usually calls for a
// pricing/selection rethink. Applied here to both shop_items (did it
// actually sell) and opportunities (did someone actually win it) as two
// independent "did real demand show up" signals per category.
const STRONG_SELL_THROUGH_PCT = 70;
const WEAK_SELL_THROUGH_PCT = 35;

// 27 Aug 2026 — real Awin price data is directly observed fact, not a
// statistical inference the way a sell-through percentage is, so it needs
// a much smaller sample before it's trustworthy — 3 real prices in a
// category is a genuine signal; 5 was chosen above for a *rate* (sold/not
// sold) specifically because a rate needs more data points to not be noise.
const AWIN_MIN_SAMPLE_SIZE = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
}

function describePerformance(label: string, soldCount: number, totalCount: number): string | null {
  if (totalCount < MIN_SAMPLE_SIZE) return null;
  const pct = (soldCount / totalCount) * 100;
  if (pct >= STRONG_SELL_THROUGH_PCT) return `${Math.round(pct)}% of recent ${label} sold (strong — lean into this)`;
  if (pct < WEAK_SELL_THROUGH_PCT) return `${Math.round(pct)}% of recent ${label} sold (weak — be extra selective here)`;
  return null; // mid-range is genuinely unremarkable — no note is more honest than a lukewarm one
}

/**
 * Builds this run's DiscoveryContext (see sourceAdapter.ts) from migration
 * 0019's admin tables plus recent sourcing history — one read at the start
 * of a run, handed to the adapter so it can steer its search, and also used
 * below as a second, independent dedup check (the adapter is asked not to
 * repeat these, but a candidate that slips through anyway is still caught
 * here before it's ever inserted). Also returns a name->id lookup for
 * seasonal_events, so a candidate's seasonalEventName can be turned into
 * the real shop_items.seasonal_event_id foreign key.
 */
async function loadDiscoveryContext(
  db: ReturnType<typeof createDb>,
): Promise<{ context: DiscoveryContext; seasonalEventIdByName: Map<string, string> }> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const recentSinceIso = new Date(Date.now() - RECENT_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const perfSinceIso = new Date(Date.now() - PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [focusResult, seasonalResult, recentOppsResult, recentShopResult, categoriesResult, perfShopResult, perfOppResult, awinResult, trendingResult] = await Promise.all([
    db.from("discovery_focus").select("category_slug, status, focus_note"),
    db
      .from("seasonal_events")
      .select("id, name, category_slugs, search_ends_on")
      .lte("search_starts_on", todayIso)
      .gte("search_ends_on", todayIso),
    db.from("opportunities").select("product_name").gte("created_at", recentSinceIso),
    db.from("shop_items").select("product_name").gte("created_at", recentSinceIso),
    db.from("categories").select("id, slug"),
    db.from("shop_items").select("category_id, paid_at").gte("created_at", perfSinceIso),
    db.from("opportunities").select("category_id, won_by").gte("created_at", perfSinceIso),
    // 27 Aug 2026 — real Awin affiliate prices (migration 0025), the "use
    // this info to help search better" half of Steven's ask. in_stock only
    // — a delisted/out-of-stock price isn't a live market signal.
    db.from("affiliate_products").select("category_id, price_gbp").eq("in_stock", true).not("price_gbp", "is", null),
    // 18 Sept 2026 — real TikTok trend signals (migration 0036), "add this
    // to make the bot clever." expires_on >= today only — a stale trend
    // (fashion moves on within weeks, unlike a seasonal calendar date)
    // should fall out of the AI's context on its own rather than needing a
    // separate cleanup job.
    db.from("trending_signals").select("keyword, category_slugs, note").gte("expires_on", todayIso),
  ]);

  const pausedCategorySlugs = (focusResult.data ?? [])
    .filter((row: { status: string }) => row.status === "paused")
    .map((row: { category_slug: string }) => row.category_slug);

  const focusNotes: Record<string, string> = {};
  for (const row of (focusResult.data ?? []) as { category_slug: string; focus_note: string | null }[]) {
    if (row.focus_note && row.focus_note.trim()) focusNotes[row.category_slug] = row.focus_note.trim();
  }

  const seasonalEventIdByName = new Map<string, string>();
  const seasonalGuidance = ((seasonalResult.data ?? []) as { id: string; name: string; category_slugs: string[]; search_ends_on: string }[]).map(
    (row) => {
      seasonalEventIdByName.set(row.name, row.id);
      return { name: row.name, categorySlugs: row.category_slugs ?? [], searchEndsOn: row.search_ends_on };
    },
  );

  const recentNamesSet = new Set<string>();
  for (const row of (recentOppsResult.data ?? []) as { product_name: string | null }[]) {
    if (row.product_name) recentNamesSet.add(normalizeProductName(row.product_name));
  }
  for (const row of (recentShopResult.data ?? []) as { product_name: string | null }[]) {
    if (row.product_name) recentNamesSet.add(normalizeProductName(row.product_name));
  }

  const slugByCategoryId = new Map<string, string>(
    ((categoriesResult.data ?? []) as { id: string; slug: string }[]).map((c) => [c.id, c.slug]),
  );

  const shopTotals = new Map<string, { sold: number; total: number }>();
  for (const row of (perfShopResult.data ?? []) as { category_id: string; paid_at: string | null }[]) {
    const t = shopTotals.get(row.category_id) ?? { sold: 0, total: 0 };
    t.total++;
    if (row.paid_at) t.sold++;
    shopTotals.set(row.category_id, t);
  }
  const oppTotals = new Map<string, { sold: number; total: number }>();
  for (const row of (perfOppResult.data ?? []) as { category_id: string; won_by: string | null }[]) {
    const t = oppTotals.get(row.category_id) ?? { sold: 0, total: 0 };
    t.total++;
    if (row.won_by) t.sold++;
    oppTotals.set(row.category_id, t);
  }

  const categoryPerformance: Record<string, { note: string }> = {};
  for (const [categoryId, slug] of slugByCategoryId) {
    const shop = shopTotals.get(categoryId);
    const opp = oppTotals.get(categoryId);
    const notes = [
      shop ? describePerformance("shop items", shop.sold, shop.total) : null,
      opp ? describePerformance("opportunities", opp.sold, opp.total) : null,
    ].filter((n): n is string => Boolean(n));
    if (notes.length > 0) categoryPerformance[slug] = { note: notes.join("; ") };
  }

  const awinPricesByCategoryId = new Map<string, number[]>();
  for (const row of (awinResult.data ?? []) as { category_id: string | null; price_gbp: number }[]) {
    if (!row.category_id) continue;
    const list = awinPricesByCategoryId.get(row.category_id) ?? [];
    list.push(row.price_gbp);
    awinPricesByCategoryId.set(row.category_id, list);
  }
  const realPriceBenchmarks: Record<string, { medianPriceGBP: number; sampleSize: number }> = {};
  for (const [categoryId, slug] of slugByCategoryId) {
    const prices = awinPricesByCategoryId.get(categoryId);
    if (prices && prices.length >= AWIN_MIN_SAMPLE_SIZE) {
      realPriceBenchmarks[slug] = { medianPriceGBP: median(prices), sampleSize: prices.length };
    }
  }

  const trendingSignals = ((trendingResult.data ?? []) as { keyword: string; category_slugs: string[] | null; note: string }[]).map(
    (row) => ({ keyword: row.keyword, categorySlugs: row.category_slugs ?? [], note: row.note }),
  );

  return {
    context: {
      pausedCategorySlugs,
      focusNotes,
      seasonalGuidance,
      recentProductNames: Array.from(recentNamesSet),
      categoryPerformance,
      realPriceBenchmarks,
      trendingSignals,
    },
    seasonalEventIdByName,
  };
}

// 26 Aug 2026, Steven, filling the dashboard for the first time: "i need it
// to keep goint to start with until its got 1 oppotunity. then stop once
// its founfd one and its displayed it on dashboard." This is the real bar
// an adapter's onBatch callback (see sourceAdapter.ts) stops against — an
// actual opportunity that's cleared verification and been inserted, ready
// to show on /opportunities, not just something the adapter reported.
// Change this one number whenever the target changes; nothing else needs
// touching.
const TARGET_OPPORTUNITIES_PER_RUN = 1;

/** Section 2 steps 1-3: Discovery -> Verification -> Packaging as an opportunity. */
export async function discoverOpportunities(adapter: SourceAdapter, targetOpportunities = TARGET_OPPORTUNITIES_PER_RUN) {
  const db = createDb();
  const { context, seasonalEventIdByName } = await loadDiscoveryContext(db);
  // Mutable across the whole run (not just context.recentProductNames,
  // which is a snapshot from before this run started) — a duplicate found
  // and created earlier IN THIS run also gets added here, so two
  // near-identical candidates from the same run (e.g. the same shoe found
  // via two different sources) don't both get created either.
  const recentNames = new Set(context.recentProductNames);

  const { data: run } = await db
    .from("discovery_runs")
    .insert({ source_adapter: adapter.name })
    .select()
    .single();

  let created = 0;
  let shopItemsCreated = 0;
  // Candidates already run through tryCreateOpportunity/tryCreateShopItem,
  // keyed by object reference — lets the same candidate be safely processed
  // either via the adapter's onBatch callback (as it's found) or the final
  // catch-all pass below (for adapters like mockAdapter that ignore onBatch
  // and just return everything at once) without double-processing it
  // either way.
  const processed = new Set<CandidateDeal>();
  const processedShop = new Set<ShopCandidate>();

  async function tryCreateOpportunity(c: CandidateDeal): Promise<boolean> {
    // 26 Aug 2026, Steven: "is the AI learning what its found... not search
    // over old ground" — independent of the prompt-level hint in
    // buildContextSections, this is the hard backstop: a product sourced in
    // roughly the last 30 days (or already created earlier this same run)
    // never gets created a second time.
    const normalizedName = normalizeProductName(c.productName);
    if (recentNames.has(normalizedName)) {
      console.log(`[discoverOpportunities] Skipped duplicate deal (already sourced in roughly the last ${RECENT_HISTORY_DAYS} days): ${c.productName}`);
      return false;
    }

    const marginGBP = c.estimatedResalePriceGBP - c.sourcePriceGBP;
    const marginPct = marginGBP / c.sourcePriceGBP;

    // Verification bar (Section 2 step 2) — discard weak candidates before
    // they ever reach a user, same as the doc specifies.
    //
    // 26 Aug 2026, Steven: a real candidate slipped through with a laptop
    // that, once he checked by hand, had NO real margin at all (eBay was
    // selling it cheaper than the "clearance" source price) — the AI's one
    // resale-evidence listing was misleading. buildPrompt()'s "ON RESALE
    // EVIDENCE" instructions now tell the model to actively check for a
    // cheaper price elsewhere before ever reporting a candidate. That was
    // originally paired with a second, independent line of defence: a flat
    // 20% GROSS margin bar (up from an original 10%) as informal headroom
    // for marketplace fees, shipping, and plain estimation error.
    //
    // 27 Aug 2026, Steven: "When live oppotunities are available i think
    // the minimum ROI should be 15% after all costs are taken into
    // consideration." Replaces that informal gross padding with an
    // explicit NET calculation — marketplace commission (at the standard
    // tier's rate, the highest of the three sellable tiers, so this stays
    // conservative regardless of which tier eventually wins it) and a flat
    // shipping estimate are actually subtracted from the margin before
    // checking the bar, rather than just leaving generic headroom and
    // hoping it covers those costs. See MIN_NET_ROI_PCT /
    // NET_ROI_SHIPPING_ESTIMATE_GBP (packages/shared/src/constants.ts) for
    // the exact figures and the "why standard tier" reasoning.
    const estimatedCommissionGBP = c.estimatedResalePriceGBP * getMarketplaceCommissionRate("standard");
    const netMarginGBP = marginGBP - estimatedCommissionGBP - NET_ROI_SHIPPING_ESTIMATE_GBP;
    const netRoiPct = netMarginGBP / c.sourcePriceGBP;
    if (netRoiPct < MIN_NET_ROI_PCT) return false;

    const { data: category } = await db.from("categories").select("id, name").eq("slug", c.categorySlug).single();
    if (!category) return false;

    const { confidenceScore: confidence, reasoning } = await scoreOpportunity({
      categoryName: category.name,
      sourceTier: c.sourceTier,
      sourceRetailer: c.sourceRetailer,
      sourcePriceGBP: c.sourcePriceGBP,
      estimatedResalePriceGBP: c.estimatedResalePriceGBP,
      marginPct,
      priceVolatility: c.priceVolatility,
      estimatedStockUnits: c.estimatedStockUnits,
    });
    if (confidence < 0.5) return false;

    const urgency = classifyUrgencyTier({
      limitedStock: c.perCustomerCap !== null,
      estimatedMarketDepth: c.estimatedStockUnits,
      priceVolatility: c.priceVolatility,
    });

    // 18 Sept 2026, Steven: "we are moving away from the bid and instant
    // win on the site... get rid of bidding and have a fixed price."
    // clockSeconds is still computed (kept as a cosmetic "Deal Heat" signal
    // — urgency_tier still drives the flame-icon badge on the card) but no
    // longer sets a real countdown: action_clock_expires_at stays null, so
    // the frontend never renders a "closing in..." clock for these. Every
    // NEW opportunity from here on is 'fixed_price' — existing live
    // 'auction' rows are untouched and keep working via the old bid/
    // instant-win routes (see migration 0034's comments).
    const clockSeconds = actionClockSeconds(urgency);
    const nowIso = new Date().toISOString();

    const fixedPriceCoins = calculateFixedDealPriceCoins(marginGBP, confidence);
    const batchSize = calculateDealBatchSize(c.estimatedStockUnits);

    // 26 Aug 2026 real-run bug: this insert's result was never checked, so a
    // failed insert (e.g. the DB missing a column this row tries to write —
    // exactly what happened today: estimated_resale_price_gbp didn't exist
    // in production yet) was silently swallowed and this function still
    // returned true, incrementing `created` and making the run's log line
    // say "opportunitiesCreated: 2" when zero rows had actually been
    // written. Steven spent a long back-and-forth chasing a display bug
    // that didn't exist — the "opportunities" were never really created.
    // Now the insert's error is checked and logged loudly, and a failed
    // insert correctly counts as not-created so the caller keeps trying
    // instead of stopping early on a phantom success.
    const { error: insertError } = await db.from("opportunities").insert({
      category_id: category.id,
      product_name: c.productName,
      image_url: c.imageUrl,
      source_tier: c.sourceTier,
      source_retailer: c.sourceRetailer,
      source_url: c.sourceUrl,
      source_price_gbp: c.sourcePriceGBP,
      estimated_resale_price_gbp: c.estimatedResalePriceGBP,
      margin_band_low: Math.max(0, marginPct - 0.03),
      margin_band_high: marginPct + 0.03,
      expected_margin_gbp: Math.round(marginGBP * 100) / 100,
      confidence_score: confidence,
      urgency_tier: urgency,
      action_clock_seconds: clockSeconds,
      estimated_stock_units: batchSize,
      // One slot per person on a fixed-price deal — "offering to one
      // person" per slot, not a quantity picker like the old instant-win.
      per_customer_cap: 1,
      pricing_mode: "fixed_price",
      fixed_price_coins: fixedPriceCoins,
      // Kept populated (same numeric value as fixed_price_coins — 1 coin =
      // £1) purely so any older code path still reading these NOT NULL
      // columns doesn't choke on a null; the new UI/logic uses
      // fixed_price_coins, not these.
      starting_bid_gbp: fixedPriceCoins,
      instant_win_price_gbp: fixedPriceCoins,
      status: "live",
      live_at: nowIso,
      action_clock_expires_at: null,
      ai_reasoning: reasoning,
    });
    if (insertError) {
      console.error(
        `[discoverOpportunities] INSERT FAILED for ${c.sourceRetailer} (${c.sourceUrl}): ${insertError.message}`,
      );
      return false;
    }
    recentNames.add(normalizedName);
    return true;
  }

  // 26 Aug 2026, Steven: "We are missing a big trick here. When the bot
  // does a search and finds an item that has a good margin on it but
  // rejects it as cannot find proof of selling then i want it to capture
  // all of the info including photos and then post the item on our shop...
  // that way any credit used isnt wasted as a missed oppotunity." A
  // ShopCandidate already passed claudeSearchAdapter's own real-discount
  // check (see buildPrompt's "TWO WAYS TO REPORT A GENUINE DISCOUNT" and
  // "REAL FAILURE CASE" instructions) — this is the second, independent
  // line of defence, same role qualifiesForShop plays here that the 20%
  // margin floor plays for tryCreateOpportunity above.
  // Returns how many rows actually got created (0 if the candidate didn't
  // qualify or every insert failed).
  async function tryCreateShopItem(c: ShopCandidate): Promise<number> {
    const normalizedName = normalizeProductName(c.productName);
    if (recentNames.has(normalizedName)) {
      console.log(`[discoverOpportunities] Skipped duplicate shop candidate (already sourced in roughly the last ${RECENT_HISTORY_DAYS} days): ${c.productName}`);
      return 0;
    }

    const pricingInput = { sourcePriceGBP: c.sourcePriceGBP, rrpGBP: c.rrpGBP };
    if (!qualifiesForShop(pricingInput)) {
      console.log(
        `[discoverOpportunities] Shop candidate didn't qualify (no real discount left vs RRP once fees are covered): ${c.productName} — source £${c.sourcePriceGBP}, RRP £${c.rrpGBP}`,
      );
      return 0;
    }

    const { data: category } = await db.from("categories").select("id").eq("slug", c.categorySlug).single();
    if (!category) return 0;

    const pricing = computeShopPricing(pricingInput);
    const seasonalEventId = c.seasonalEventName ? seasonalEventIdByName.get(c.seasonalEventName) ?? null : null;

    // 26 Aug 2026, Steven: "if there is more than one item available to buy
    // the items should not remove themselves from the store." Each unit of
    // stock becomes its OWN row here — buying one only ever removes that
    // one row, so the product stays visible on /shop as long as any
    // sibling row (grouped for display in api/shop-items/route.ts) is
    // still 'available'. Capped at SHOP_ITEM_MAX_UNITS_LISTED so an
    // overenthusiastic AI stock estimate can't flood the table.
    const unitsToList = Math.min(Math.max(1, c.estimatedStockUnits), SHOP_ITEM_MAX_UNITS_LISTED);
    let created = 0;
    for (let i = 0; i < unitsToList; i++) {
      // 26 Aug 2026, Steven, after the AI added shoes with no size shown:
      // sizes read off the source page are spread one-per-unit (cycling if
      // there are fewer sizes than units) — each row is one physical unit,
      // so each unit's size should reflect one real size, not every size
      // available. null (not filtered on) if the AI found no sizes at all
      // for this product — see lib/sizeFilter.ts.
      const size = c.sizes.length > 0 ? c.sizes[i % c.sizes.length] : null;
      const { error: insertError } = await db.from("shop_items").insert({
        category_id: category.id,
        product_name: c.productName,
        description: c.description,
        image_url: c.imageUrl,
        source_retailer: c.sourceRetailer,
        source_url: c.sourceUrl,
        source_price_gbp: c.sourcePriceGBP,
        rrp_gbp: c.rrpGBP,
        our_price_gbp: pricing.ourPriceGBP,
        min_offer_accept_gbp: pricing.minOfferAcceptGBP,
        fulfillment_reward_gbp: pricing.fulfillmentRewardGBP,
        fulfiller_reimbursement_gbp: pricing.fulfillerReimbursementGBP,
        estimated_stock_units: 1, // this row IS one unit now — see the comment above
        status: "available",
        size,
        seasonal_event_id: seasonalEventId,
      });
      if (insertError) {
        console.error(
          `[discoverOpportunities] shop_items INSERT FAILED (unit ${i + 1}/${unitsToList}) for ${c.sourceRetailer} (${c.sourceUrl}): ${insertError.message}`,
        );
        continue;
      }
      created++;
    }
    if (created > 0) {
      recentNames.add(normalizedName);
      console.log(`[discoverOpportunities] Listed on shop: ${c.productName} — ${created} unit(s) at £${pricing.ourPriceGBP} (RRP £${c.rrpGBP})`);
    }
    return created;
  }

  async function processBatch(batch: DiscoveryBatch): Promise<boolean> {
    for (const c of batch.deals) {
      if (processed.has(c)) continue;
      processed.add(c);
      if (await tryCreateOpportunity(c)) created++;
      if (created >= targetOpportunities) break;
    }
    // Shop candidates are never gated behind the reseller-opportunity
    // target (see sourceAdapter.ts) — every genuine one found gets
    // listed regardless of whether this run's opportunity target has
    // already been hit, per Steven's "any credit used isnt wasted" ask.
    for (const c of batch.shopCandidates) {
      if (processedShop.has(c)) continue;
      processedShop.add(c);
      shopItemsCreated += await tryCreateShopItem(c);
    }
    return created >= targetOpportunities;
  }

  const candidates = await adapter.findCandidates(processBatch, context);
  // Catch-all: process anything the adapter returned but never actually
  // ran through the callback (adapters like mockAdapter ignore onBatch
  // entirely and just return everything at once) — processed/processedShop's
  // dedupe means anything the callback already handled is skipped here.
  //
  // 26 Aug 2026 real-run bug: this used to run unconditionally, even when
  // the callback path had already hit the target and told the adapter to
  // stop. processBatch's own for-loop breaks the INSTANT it hits the
  // target, so a batch with 2+ candidates where the first one alone
  // satisfies the target leaves the second one never added to `processed`
  // — and this catch-all would then pick it up and create it anyway.
  // Real trigger: TARGET_OPPORTUNITIES_PER_RUN=1, a Zavvi batch reported 2
  // real candidates, and both got created instead of stopping at 1. Deals
  // still only run the catch-all when the target genuinely hasn't been met
  // yet — which is also exactly the case mockAdapter needs it for, since it
  // never calls onBatch at all and `created` stays 0. shopCandidates are
  // always passed through here regardless of `created`, since they're never
  // subject to the opportunity target in the first place.
  await processBatch({
    deals: created < targetOpportunities ? candidates.deals : [],
    shopCandidates: candidates.shopCandidates,
  });

  if (run) {
    await db
      .from("discovery_runs")
      .update({
        candidates_found: candidates.deals.length + candidates.shopCandidates.length,
        opportunities_created: created,
        shop_items_created: shopItemsCreated,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
  }

  return {
    candidatesFound: candidates.deals.length,
    opportunitiesCreated: created,
    shopCandidatesFound: candidates.shopCandidates.length,
    shopItemsCreated,
  };
}
