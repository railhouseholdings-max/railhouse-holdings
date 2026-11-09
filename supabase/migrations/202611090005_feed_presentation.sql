-- Owner-managed display metadata; imports intentionally do not overwrite these fields.
begin;
alter table public.properties add column added_date_override date;
alter table public.properties add column new_marked_at timestamptz;
comment on column public.properties.added_date_override is 'Explicit feed date correction, independent of listing dates and import timestamps.';
comment on column public.properties.new_marked_at is 'Owner manually restarted the seven-day New label; viewing does not clear it.';
update public.properties set added_date_override=date '2026-01-01'
where lower(city)='fort wayne' and address ~* '^2221[[:space:]]+eby[[:space:]]+ave(nue)?([.,[:space:]]|$)';
commit;
