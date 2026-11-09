-- Purchased properties may still have unverified physical facts or no recorded operating actuals.
-- Preserve unknowns rather than inventing values to satisfy the previous owned-only constraint.
begin;
alter table public.properties drop constraint owned_property_facts_required;
alter table public.properties add column ownership jsonb not null default '{}' check(jsonb_typeof(ownership)='object');
create function public.purchase_deal(p_deal uuid,p_revision bigint,p_price numeric,p_date date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.deals; p public.properties;
begin
  if not private.is_app_owner() then raise exception 'Owner access required'; end if;
  if p_price is null or p_price not between 0 and 1000000000 or p_date is null or p_date<date '1900-01-01' or p_date>(now() at time zone 'America/New_York')::date then raise exception 'Invalid purchase facts'; end if;
  select * into d from public.deals where id=p_deal and owner_id=auth.uid() for update;
  if d.id is null then raise exception 'Saved deal not found'; end if;
  if d.revision<>p_revision then raise exception 'Deal changed in another session. Reload before recording purchase.'; end if;
  select * into p from public.properties where id=d.property_id and owner_id=auth.uid() for update;
  if p.id is null then raise exception 'Property not found'; end if;
  -- Retry-safe: never overwrite an existing confirmed purchase or operating records.
  if p.lifecycle<>'owned' then
    update public.properties set lifecycle='owned',feed_visible=true,
      ownership=jsonb_build_object('purchaseDate',p_date,'purchasePrice',p_price,'recordedAt',now(),'source','owner-confirmed'),
      updated_at=now() where id=p.id;
  end if;
  return jsonb_build_object('propertyId',p.id,'lifecycle','owned');
end;
$$;
revoke all on function public.purchase_deal(uuid,bigint,numeric,date) from public,anon,service_role;
grant execute on function public.purchase_deal(uuid,bigint,numeric,date) to authenticated;
-- Owner confirmed ownership; the feed-date correction is not an acquisition-date claim.
update public.properties set lifecycle='owned',feed_visible=true,
 ownership=case when ownership='{}'::jsonb then jsonb_build_object('source','owner-confirmed') else ownership end
where lower(city)='fort wayne' and address ~* '^2221[[:space:]]+eby[[:space:]]+ave(nue)?([.,[:space:]]|$)';
commit;
