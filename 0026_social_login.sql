-- 27 Aug 2026, Steven: "need to have users be able to login with google,
-- facebook and apple." Two small pieces of DB support for social login
-- (the actual OAuth wiring is all app-side — see apps/web/app/login/page.tsx,
-- apps/web/app/components/SocialAuthButtons.tsx, api/auth/callback/route.ts).
--
-- 1. handle_new_user() only ever looked for `display_name` in
--    raw_user_meta_data (set explicitly by our own /signup form). Google and
--    Facebook populate that same column with their own provider profile
--    fields instead — Google gives `full_name` and `name`, Facebook gives
--    `name` — so without this, every social sign-up would fall straight
--    through to the email-prefix fallback and show as "steven" instead of
--    "Steven Whatever". Apple deliberately gives none of these (their
--    privacy model only shares a name on the very first authorization, and
--    only if the developer app requested it — nothing this trigger can rely
--    on), so the email-prefix fallback stays the last resort either way.
--
--    Following the same pattern 0016_referral_program.sql already
--    established for this exact function: never edit 0004's original file,
--    redefine the function body here instead — the trigger still points at
--    the same function name, nothing else needs re-wiring.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_code text := upper(substr(replace(new.id::text, '-', ''), 1, 8));
  incoming_code text := new.raw_user_meta_data->>'referral_code';
  referrer_id uuid;
  reward_gbp numeric := 5.00;
begin
  if incoming_code is not null then
    select id into referrer_id from public.profiles where referral_code = incoming_code;
  end if;

  insert into public.profiles (id, display_name, referral_code, referred_by)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new_code,
    referrer_id
  );

  if referrer_id is not null then
    insert into public.wallet_transactions (profile_id, amount_gbp, kind) values
      (referrer_id, reward_gbp, 'referral_credit'),
      (new.id, reward_gbp, 'referral_credit');
  end if;

  return new;
end;
$$;

-- 2. Referral pass-through for OAuth sign-ups specifically. /signup?ref=CODE
--    already threads referral_code into raw_user_meta_data for email/
--    password sign-up (handled entirely by the trigger above, at insert
--    time). Supabase's signInWithOAuth has no equivalent of signUp's
--    `options.data` — there's no user row to attach metadata to until the
--    provider round-trip finishes — so SocialAuthButtons.tsx instead stashes
--    the ref code in a short-lived cookie before redirecting to the
--    provider, and api/auth/callback/route.ts calls this function
--    afterwards, once the profile actually exists, to reconcile it.
--    security definer + explicit service_role grant only: this moves wallet
--    balance, so it must never be callable by an ordinary authenticated
--    user's anon-key session, only from the trusted server-side callback
--    route (which uses the service-role client — see lib/supabase/server.ts).
create or replace function public.apply_oauth_referral(target_user_id uuid, incoming_code text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  referrer_id uuid;
  reward_gbp numeric := 5.00;
  target_created_at timestamptz;
  target_referred_by uuid;
begin
  select created_at, referred_by into target_created_at, target_referred_by
  from public.profiles where id = target_user_id;

  -- Already has a referrer (including "credited earlier in this same flow"
  -- if the callback route ever double-fires), or doesn't exist at all.
  if target_created_at is null or target_referred_by is not null then
    return;
  end if;

  -- Guard against a stale cookie crediting an unrelated, much later sign-in
  -- on the same browser — this should only ever fire in the seconds right
  -- after the profile row was first created.
  if target_created_at < now() - interval '10 minutes' then
    return;
  end if;

  select id into referrer_id
  from public.profiles
  where referral_code = incoming_code and id != target_user_id;

  if referrer_id is null then
    return;
  end if;

  update public.profiles set referred_by = referrer_id where id = target_user_id;

  insert into public.wallet_transactions (profile_id, amount_gbp, kind) values
    (referrer_id, reward_gbp, 'referral_credit'),
    (target_user_id, reward_gbp, 'referral_credit');
end;
$$;

revoke all on function public.apply_oauth_referral(uuid, text) from public;
grant execute on function public.apply_oauth_referral(uuid, text) to service_role;
