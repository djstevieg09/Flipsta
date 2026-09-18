-- 18 Sept 2026, Steven: "Looks very bad and bare [signup page]... need more
-- info like address and maybe if they are a business or personal flipping.
-- ask for business name if there is one and age as need to be 16 to use
-- the site." Adds the extra profile fields the redesigned /signup form now
-- collects, and redefines the signup trigger (originally
-- 0004_auth_profile_trigger.sql, last redefined by
-- 0016_referral_program.sql) to populate them from auth.users'
-- raw_user_meta_data the same way display_name/referral_code already are.
--
-- Nullable at the DB level even though the form makes them required going
-- forward — accounts created before this date have none of this, and a
-- NOT NULL column can't be added to a populated table without a default
-- that would fabricate data for them. "Required" is enforced in the
-- signup form itself; the age-16 rule is additionally enforced here as a
-- check constraint so it can't be bypassed by calling the API directly.
--
-- account_type mirrors the existing trade_sellers concept (0001_init.sql)
-- in spirit but is deliberately a separate, simpler field on profiles
-- itself: trade_sellers is the distributor/wholesale program (Section
-- 11.5, its own verification flow); this is just "are you flipping for
-- yourself or as a registered business" at signup, for every account tier.

alter table profiles add column if not exists account_type text not null default 'personal'
  check (account_type in ('personal', 'business'));
alter table profiles add column if not exists business_name text;
alter table profiles add column if not exists date_of_birth date
  check (date_of_birth is null or date_of_birth <= (current_date - interval '16 years'));
alter table profiles add column if not exists address_line1 text;
alter table profiles add column if not exists address_line2 text;
alter table profiles add column if not exists city text;
alter table profiles add column if not exists postcode text;
alter table profiles add column if not exists country text not null default 'GB';

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

  insert into public.profiles (
    id, display_name, referral_code, referred_by,
    account_type, business_name, date_of_birth,
    address_line1, address_line2, city, postcode, country
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new_code,
    referrer_id,
    coalesce(new.raw_user_meta_data->>'account_type', 'personal'),
    new.raw_user_meta_data->>'business_name',
    (new.raw_user_meta_data->>'date_of_birth')::date,
    new.raw_user_meta_data->>'address_line1',
    new.raw_user_meta_data->>'address_line2',
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'postcode',
    coalesce(new.raw_user_meta_data->>'country', 'GB')
  );

  if referrer_id is not null then
    insert into public.wallet_transactions (profile_id, amount_gbp, kind) values
      (referrer_id, reward_gbp, 'referral_credit'),
      (new.id, reward_gbp, 'referral_credit');
  end if;

  return new;
end;
$$;
