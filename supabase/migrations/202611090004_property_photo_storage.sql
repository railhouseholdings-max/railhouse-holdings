-- Archive original image bytes privately; source listing removal never deletes these objects.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('railhouse-property-photos','railhouse-property-photos',false,6291456,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy railhouse_property_photos_owner_read on storage.objects for select to authenticated
using(bucket_id='railhouse-property-photos' and split_part(name,'/',1)=auth.uid()::text and private.is_app_owner());
-- Uploads are server/service-role only. No new anonymous or authenticated write policy.
commit;
