import { createSupabaseServerClient } from "./supabase/server";
import { Profile } from "@flipsta/shared";

export async function getCurrentProfile(): Promise<{ userId: string; profile: Profile } | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error || !data) return null;

  return {
    userId: user.id,
    profile: {
      id: data.id,
      displayName: data.display_name,
      subscriptionTier: data.subscription_tier,
      role: data.role ?? "user",
      status: data.status ?? "active",
      createdAt: data.created_at,
      // 18 Sept 2026, Steven: signup now collects these (see
      // app/signup/page.tsx) — surfaced here so /account and anywhere
      // else reading getCurrentProfile() can show them. Null on accounts
      // created before this date.
      accountType: data.account_type ?? "personal",
      businessName: data.business_name ?? null,
      dateOfBirth: data.date_of_birth ?? null,
      addressLine1: data.address_line1 ?? null,
      addressLine2: data.address_line2 ?? null,
      city: data.city ?? null,
      postcode: data.postcode ?? null,
      country: data.country ?? null,
      flippyCoinBalance: data.flippy_coin_balance ?? 0,
    },
  };
}
