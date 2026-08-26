import { suggestListingFromOpportunity } from "@flipsta/shared";

/**
 * 26 Aug 2026, Steven: "when someone buys an oppotunity it should list the
 * item straight away once they have confirmed how many units they
 * brought." Confirmed via a clarifying question: fully automatic, no
 * review screen — the moment Instant Win succeeds, this runs and the item
 * is live on the marketplace. Reuses the exact same suggestListingFromOpportunity
 * pricing/title logic /sell/new has always used (the manual path stays for
 * regular, non-instant-win auction wins), just with nobody looking it over
 * first per Steven's answer.
 *
 * Kept as a standalone helper (not inlined in the instant-win route) so the
 * find-or-create-product + insert-listing shape isn't duplicated between
 * this and POST /api/listings, even though the two call it at different
 * moments for different reasons.
 */
export async function autoListWonOpportunity(
  supabase: any,
  opportunity: {
    id: string;
    category_id: string;
    categories: { name: string } | { name: string }[] | null;
    source_tier: string;
    source_retailer: string | null;
    source_price_gbp: number | null;
    expected_margin_gbp: number;
    product_name: string | null;
    image_url: string | null;
  },
  sellerId: string,
  quantity: number,
) {
  const categoryName = Array.isArray(opportunity.categories)
    ? opportunity.categories[0]?.name
    : opportunity.categories?.name;

  const suggestion = suggestListingFromOpportunity({
    categoryName: categoryName ?? "Item",
    sourceTier: opportunity.source_tier,
    sourcePriceGBP: opportunity.source_price_gbp ?? 0,
    expectedMarginGBP: opportunity.expected_margin_gbp,
    productName: opportunity.product_name,
    sourceRetailer: opportunity.source_retailer,
  });

  // suggestedDescription ends with "Edit this description before
  // publishing." — correct advice on /sell/new, where a seller actually
  // sees and can edit it before submitting, but this path skips that step
  // entirely (Steven's confirmed "fully automatic, no review screen"
  // answer), so that instruction would show to real buyers as broken copy
  // on a listing nobody ever got the chance to edit.
  const description = suggestion.suggestedDescription.replace(/\s*Edit this description before publishing\.$/, "");

  const { data: existingProduct } = await supabase
    .from("products")
    .select("id")
    .eq("title", suggestion.suggestedTitle)
    .eq("condition", "New")
    .maybeSingle();

  let productId = existingProduct?.id as string | undefined;
  if (!productId) {
    const { data: newProduct, error: productError } = await supabase
      .from("products")
      .insert({
        title: suggestion.suggestedTitle,
        condition: "New",
        category_id: opportunity.category_id,
        description,
        image_url: opportunity.image_url ?? null,
      })
      .select("id")
      .single();
    if (productError) throw new Error(productError.message);
    productId = newProduct.id;
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .insert({
      product_id: productId,
      seller_id: sellerId,
      price_gbp: suggestion.suggestedPriceGBP,
      quantity,
      opportunity_id: opportunity.id,
    })
    .select()
    .single();
  if (listingError) throw new Error(listingError.message);

  return { listing, suggestion };
}
