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
    },
  };
}
