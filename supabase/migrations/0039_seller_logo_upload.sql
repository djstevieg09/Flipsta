-- 19 Sept 2026, Steven: "also need an option to upload a logo for the
-- sellers to put on their accounts page." No file-upload infrastructure
-- exists anywhere in this codebase yet — every image so far is either a
-- static asset under apps/web/public or a URL a staff member pastes in by
-- hand (admin/shop-photos, admin/dropship-products). This is the first
-- real Supabase Storage bucket the app uses.

alter table profiles add column if not exists logo_url text;

-- Public bucket: a seller's logo needs to be viewable by anyone looking at
-- their listings/profile, same as every other product image in this app
-- (all served from public URLs already). Uploads themselves are still
-- locked down by the RLS policies below — public just means "readable by
-- anyone with the URL", not "writable by anyone".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seller-logos', 'seller-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Objects are stored as "<profile_id>/logo.<ext>" (see api/account/logo/route.ts)
-- — storage.foldername(name) splits that path, so [1] is the profile_id
-- segment. A user can only write into their own folder; anyone can read
-- any logo (bucket is public, matches every other image in this app).
create policy "seller logos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'seller-logos');

create policy "sellers can upload their own logo"
  on storage.objects for insert
  with check (bucket_id = 'seller-logos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "sellers can replace their own logo"
  on storage.objects for update
  using (bucket_id = 'seller-logos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "sellers can remove their own logo"
  on storage.objects for delete
  using (bucket_id = 'seller-logos' and auth.uid()::text = (storage.foldername(name))[1]);
