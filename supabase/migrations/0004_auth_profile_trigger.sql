-- Closes a real gap: nothing anywhere in the codebase previously created a
-- `profiles` row for a new Supabase Auth user, which meant a freshly
-- signed-up user had no profile and every part of the app that reads
-- `getCurrentProfile()` (apps/web/lib/currentProfile.ts) would silently
-- treat them as signed out. This is the standard Supabase pattern: a
-- trigger on auth.users that inserts the matching profiles row.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
