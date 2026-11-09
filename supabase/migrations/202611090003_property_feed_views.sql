-- One owner-wide read marker per canonical property; imports never touch it.
begin;
alter table public.properties add column first_viewed_at timestamptz;
comment on column public.properties.first_viewed_at is 'First explicit property view since read tracking was enabled; never reset by listing imports.';
commit;
