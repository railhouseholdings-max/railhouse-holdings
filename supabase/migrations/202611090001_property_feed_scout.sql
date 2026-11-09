-- Additive feed/scout migration. Existing owned-property calculations remain unchanged.
begin;
create function private.property_key(p_address text) returns text language plpgsql immutable set search_path='' as $$
declare v text; w text; result text:='';
begin
 v:=regexp_replace(upper(trim(p_address)), '\m[0-9]{5}(-[0-9]{4})?\s*$', '');
 v:=regexp_replace(replace(v,'#',' UNIT '),'[^A-Z0-9 ]',' ','g');
 foreach w in array regexp_split_to_array(v,'\s+') loop
  w:=case w when 'AVENUE' then 'AVE' when 'STREET' then 'ST' when 'ROAD' then 'RD' when 'DRIVE' then 'DR' when 'LANE' then 'LN' when 'COURT' then 'CT' when 'BOULEVARD' then 'BLVD' when 'PLACE' then 'PL' when 'TERRACE' then 'TER' when 'PARKWAY' then 'PKWY' when 'NORTH' then 'N' when 'SOUTH' then 'S' when 'EAST' then 'E' when 'WEST' then 'W' when 'APARTMENT' then 'UNIT' when 'APT' then 'UNIT' when 'SUITE' then 'UNIT' when 'STE' then 'UNIT' else w end;
  if w<>'' then result:=concat_ws(' ',nullif(result,''),w); end if;
 end loop;
 return result;
end $$;
grant execute on function private.property_key(text) to authenticated, service_role;
grant usage on schema private to service_role;
alter table public.properties add column lifecycle text not null default 'owned' check(lifecycle in ('owned','prospect'));
alter table public.properties add column identity_key text;
alter table public.properties add column property_details jsonb not null default '{}' check(jsonb_typeof(property_details)='object' and octet_length(property_details::text)<=48000);
alter table public.properties add column details_revision bigint not null default 0;
alter table public.properties add column updated_at timestamptz not null default now();
alter table public.properties add column listing jsonb;
alter table public.properties add column feed_visible boolean not null default true;
alter table public.properties add column manual_review jsonb not null default '{}' check(jsonb_typeof(manual_review)='object' and octet_length(manual_review::text)<64000);
alter table public.properties add column scout_evaluation jsonb;
alter table public.properties add column first_discovered_at timestamptz;
alter table public.properties add column latitude double precision;
alter table public.properties add column longitude double precision;
-- Prospects have unknown facts and no acquisition/loan/lease records. Never fill them with zeros.
alter table public.properties alter column beds drop not null, alter column baths drop not null, alter column square_feet drop not null, alter column year_built drop not null, alter column garage drop not null, alter column lot_square_feet drop not null, alter column property_type drop not null, alter column status drop not null;
alter table public.properties add constraint owned_property_facts_required check(lifecycle<>'owned' or (beds is not null and baths is not null and square_feet is not null and year_built is not null and garage is not null and lot_square_feet is not null and property_type is not null and status is not null));
update public.properties set identity_key=private.property_key(case when position(',' in address)>0 then address else address||', '||city||', '||state end);
-- Ambiguous existing owned duplicates fail visibly for manual reconciliation; no history is deleted.
alter table public.properties alter column identity_key set not null;
create unique index properties_canonical_identity on public.properties(owner_id,identity_key);
create function private.ensure_property(p_owner uuid,p_address text) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_key text;
begin
 v_key:=private.property_key(p_address);
 if length(v_key)<3 or length(p_address)>240 then raise check_violation using message='Invalid property address'; end if;
 insert into public.properties(owner_id,address,city,state,zip,identity_key,lifecycle)
 values(p_owner,p_address,coalesce(nullif(trim((string_to_array(p_address,','))[array_length(string_to_array(p_address,','),1)-1]),''),''),coalesce(substring(trim((string_to_array(p_address,','))[array_length(string_to_array(p_address,','),1)]) from '^([A-Za-z]{2})'),''),coalesce(substring(p_address from '([0-9]{5})(-[0-9]{4})?\s*$'),''),v_key,'prospect')
 on conflict(owner_id,identity_key) do update set identity_key=excluded.identity_key returning id into v_id;
 return v_id;
end $$;
grant execute on function private.ensure_property(uuid,text) to authenticated, service_role;
-- Backfill links for every saved analysis; scenarios/history stay separate from physical identity.
do $$ declare r record; begin
 for r in select id,owner_id,address from public.deals where property_id is null loop
  update public.deals set property_id=private.ensure_property(r.owner_id,r.address) where id=r.id;
 end loop;
end $$;
create index deals_property_latest on public.deals(property_id,updated_at desc);
create or replace function public.save_deal(p_id uuid, p_expected_revision bigint, p_deal jsonb, p_adjustments jsonb, p_taxes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_existing public.deals%rowtype;
  v_deal public.deals%rowtype;
  v_adjustments public.deal_adjustments%rowtype;
  v_taxes public.deal_tax_assumptions%rowtype;
  v_property uuid;
begin
  if v_owner is null or not private.is_app_owner() then raise insufficient_privilege using message = 'Private workspace access denied'; end if;
  select * into v_existing from public.deals where id = p_id for update;
  if found then
    if p_expected_revision is null or v_existing.revision <> p_expected_revision then
      raise unique_violation using message = 'Deal revision conflict';
    end if;
  elsif p_expected_revision is not null then
    raise unique_violation using message = 'Deal revision conflict';
  end if;
  v_property := private.ensure_property(v_owner,p_deal->>'address');
  update public.properties set feed_visible=true where id=v_property;
  if p_deal ? 'property_details' then
    if jsonb_typeof(p_deal->'property_details') <> 'object' or octet_length((p_deal->'property_details')::text)>48000 then raise check_violation using message='Invalid property details'; end if;
    perform 1 from public.properties where id=v_property and details_revision=coalesce((p_deal->>'expected_property_revision')::bigint,0) for update;
    if not found then raise unique_violation using message='Property revision conflict'; end if;
    update public.properties set property_details=p_deal->'property_details', details_revision=details_revision+1, updated_at=now() where id=v_property;
  end if;
  v_deal := jsonb_populate_record(null::public.deals, p_deal || jsonb_build_object(
    'id',p_id,'owner_id',v_owner,'property_id',v_property,
    'created_at',coalesce(v_existing.created_at,now()),'updated_at',now(),'revision',coalesce(v_existing.revision,0)+1));
  insert into public.deals select (v_deal).* on conflict (id) do update set
    property_id = excluded.property_id,
    address = excluded.address,
    status = excluded.status,
    revision = excluded.revision,
    updated_at = excluded.updated_at,
    purchase_price = excluded.purchase_price,
    rehab_budget = excluded.rehab_budget,
    unexpected_construction_costs = excluded.unexpected_construction_costs,
    holding_costs = excluded.holding_costs,
    arv = excluded.arv,
    monthly_rent = excluded.monthly_rent,
    interest_rate = excluded.interest_rate,
    refinance_ltv = excluded.refinance_ltv,
    loan_term_years = excluded.loan_term_years,
    closing_costs = excluded.closing_costs,
    appraisal_fee = excluded.appraisal_fee,
    origination_percent = excluded.origination_percent,
    closing_date = excluded.closing_date,
    tax_escrow = excluded.tax_escrow,
    insurance_escrow = excluded.insurance_escrow,
    annual_property_taxes = excluded.annual_property_taxes,
    annual_insurance = excluded.annual_insurance,
    management_percent = excluded.management_percent,
    monthly_capex_reserve = excluded.monthly_capex_reserve,
    vacancy_percent = excluded.vacancy_percent,
    maintenance_percent = excluded.maintenance_percent
  where public.deals.revision = p_expected_revision;
  if not found then raise unique_violation using message = 'Deal revision conflict'; end if;
  v_adjustments := jsonb_populate_record(null::public.deal_adjustments, p_adjustments || jsonb_build_object('deal_id',p_id,'owner_id',v_owner));
  delete from public.deal_adjustments where deal_id = p_id;
  insert into public.deal_adjustments select (v_adjustments).*;
  v_taxes := jsonb_populate_record(null::public.deal_tax_assumptions, p_taxes || jsonb_build_object('deal_id',p_id,'owner_id',v_owner));
  delete from public.deal_tax_assumptions where deal_id = p_id;
  insert into public.deal_tax_assumptions select (v_taxes).*;
  return jsonb_build_object('id',p_id,'revision',v_deal.revision,'updated_at',v_deal.updated_at,'property_id',v_property,'property_revision',(select details_revision from public.properties where id=v_property));
end;
$$;
create table public.scout_settings (
 owner_id uuid primary key references auth.users(id), config jsonb not null check(jsonb_typeof(config)='object'),
 discovery_checkpoint timestamptz, updated_at timestamptz not null default now()
);
create table public.scout_runs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), run_key text not null,
 started_at timestamptz not null default now(), completed_at timestamptz, status text not null check(status in ('running','succeeded','partial','failed')),
 requests integer not null default 0, summary jsonb not null default '{}', unique(owner_id,run_key)
);
create unique index scout_one_running on public.scout_runs(owner_id) where status='running';
create table public.scout_usage (
 owner_id uuid not null references auth.users(id), month text not null, requests integer not null default 0,
 primary key(owner_id,month)
);
create table public.property_listing_history (
 id bigint generated always as identity primary key, owner_id uuid not null references auth.users(id), property_id uuid not null,
 run_id uuid references public.scout_runs(id), recorded_at timestamptz not null default now(), observation jsonb not null,
 foreign key(property_id,owner_id) references public.properties(id,owner_id)
);
-- Immutable financial/ARV snapshots; current listing status never erases older analysis.
create table public.property_scout_evaluations (
 id bigint generated always as identity primary key, owner_id uuid not null references auth.users(id), property_id uuid not null,
 run_id uuid not null references public.scout_runs(id), recorded_at timestamptz not null default now(), evaluation jsonb not null,
 foreign key(property_id,owner_id) references public.properties(id,owner_id),unique(run_id,property_id)
);
alter table public.property_scout_evaluations enable row level security;
revoke all on public.property_scout_evaluations from public,anon,authenticated;
grant select on public.property_scout_evaluations to authenticated;
create policy owner_only on public.property_scout_evaluations for select to authenticated using(owner_id=auth.uid() and private.is_app_owner());
grant all on public.property_scout_evaluations to service_role;
grant usage,select on sequence public.property_scout_evaluations_id_seq to service_role;
-- RLS applies to reads; only the bounded server-side Scout functions write run/history data.
alter table public.scout_settings enable row level security;
alter table public.scout_runs enable row level security;
alter table public.scout_usage enable row level security;
alter table public.property_listing_history enable row level security;
revoke all on public.scout_settings,public.scout_runs,public.scout_usage,public.property_listing_history from public,anon,authenticated;
grant select,insert,update on public.scout_settings to authenticated;
grant select on public.scout_runs,public.scout_usage,public.property_listing_history to authenticated;
create policy owner_only on public.scout_settings for all to authenticated using(owner_id=auth.uid() and private.is_app_owner()) with check(owner_id=auth.uid() and private.is_app_owner());
create policy owner_only on public.scout_runs for select to authenticated using(owner_id=auth.uid() and private.is_app_owner());
create policy owner_only on public.scout_usage for select to authenticated using(owner_id=auth.uid() and private.is_app_owner());
create policy owner_only on public.property_listing_history for select to authenticated using(owner_id=auth.uid() and private.is_app_owner());
grant all on public.scout_settings,public.scout_runs,public.scout_usage,public.property_listing_history to service_role;
grant usage,select on sequence public.property_listing_history_id_seq to service_role;
create function public.scout_begin(p_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner uuid; v_run public.scout_runs%rowtype;
begin
 select user_id into strict v_owner from private.app_owner where singleton for update;
 -- A killed serverless invocation must not block tomorrow's job. Lease exceeds maxDuration.
 update public.scout_runs set status='failed',completed_at=now(),summary='{"errors":["Previous invocation exceeded its ten-minute lease."]}' where owner_id=v_owner and status='running' and started_at<now()-interval '10 minutes';
 if exists(select 1 from public.scout_runs where owner_id=v_owner and (run_key=p_key or status='running')) then return null; end if;
 insert into public.scout_runs(owner_id,run_key,status) values(v_owner,p_key,'running') returning * into v_run;
 return to_jsonb(v_run);
end $$;
create function public.scout_reserve(p_run uuid,p_month text,p_limit integer) returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.scout_runs%rowtype; used integer; configured integer; run_limit integer;
begin
 select * into strict r from public.scout_runs where id=p_run and status='running' and started_at>now()-interval '10 minutes' for update;
 select (config->>'monthlyRequestLimit')::integer,(config->>'maxRequestsPerRun')::integer into configured,run_limit from public.scout_settings where owner_id=r.owner_id;
 if p_month<>to_char(now() at time zone 'UTC','YYYY-MM') or p_limit<1 or configured is null then return false; end if;
 insert into public.scout_usage(owner_id,month) values(r.owner_id,p_month) on conflict do nothing;
 select requests into used from public.scout_usage where owner_id=r.owner_id and month=p_month for update;
 if used>=least(p_limit,configured) or r.requests>=run_limit then return false; end if;
 update public.scout_usage set requests=requests+1 where owner_id=r.owner_id and month=p_month;
 update public.scout_runs set requests=requests+1 where id=p_run;
 return true;
end $$;
create function public.scout_save_listing(p_run uuid,p_listing jsonb,p_evaluation jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.scout_runs%rowtype; v_id uuid; previous jsonb; created boolean; changed boolean; was_visible boolean; visible boolean;
begin
 select * into strict r from public.scout_runs where id=p_run and status='running' and started_at>now()-interval '10 minutes' for update;
 if jsonb_typeof(p_listing)<>'object' or octet_length(p_listing::text)>64000 or length(p_listing->>'address')>240 or coalesce(p_listing->>'status','') not in ('Active','Pending','Contingent','Sold','Off Market','Inactive','Unknown') then raise check_violation using message='Invalid listing'; end if;
 v_id:=private.ensure_property(r.owner_id,p_listing->>'address');
 select listing,(feed_visible and (first_discovered_at is not null or lifecycle='owned' or details_revision>0 or exists(select 1 from public.deals where property_id=v_id))) into previous,was_visible from public.properties where id=v_id for update;
 visible:=was_visible or (p_evaluation is not null and coalesce(p_evaluation->>'stage','screened')<>'screened' and p_evaluation->>'recommendation'<>'Pass');
 created:=not was_visible and visible;
 changed:=previous is null or previous->>'status' is distinct from p_listing->>'status' or previous->>'price' is distinct from p_listing->>'price' or previous->'closedSale' is distinct from p_listing->'closedSale';
 -- Retain all status/price changes; a newer observation cannot be overwritten by an old retry.
 if previous is not null and (previous->>'checkedAt')::timestamptz>(p_listing->>'checkedAt')::timestamptz then return jsonb_build_object('id',v_id,'created',false,'changed',false); end if;
 if changed then insert into public.property_listing_history(owner_id,property_id,run_id,observation) values(r.owner_id,v_id,p_run,p_listing); end if;
 update public.properties set feed_visible=visible,listing=p_listing,scout_evaluation=coalesce(p_evaluation,scout_evaluation),
 first_discovered_at=coalesce(first_discovered_at,now()),updated_at=now(),
 city=case when city='' then p_listing->>'city' else city end,state=case when state='' then p_listing->>'state' else state end,zip=case when zip='' then p_listing->>'zip' else zip end,
 latitude=coalesce(latitude,(p_listing->>'latitude')::double precision),longitude=coalesce(longitude,(p_listing->>'longitude')::double precision)
 where id=v_id;
 if p_evaluation is not null and coalesce(p_evaluation->>'stage','screened')<>'screened' then insert into public.property_scout_evaluations(owner_id,property_id,run_id,evaluation) values(r.owner_id,v_id,p_run,p_evaluation) on conflict(run_id,property_id) do nothing; end if;
 -- property_details and manual analyses are deliberately never changed by automation.
 return jsonb_build_object('id',v_id,'created',created,'changed',changed,'visible',visible);
end $$;
create function public.scout_finish(p_run uuid,p_summary jsonb,p_checkpoint timestamptz default null) returns void language plpgsql security invoker set search_path='' as $$
declare r public.scout_runs%rowtype;
begin
 select * into strict r from public.scout_runs where id=p_run and status='running' for update;
 if p_summary->>'status' not in ('succeeded','partial','failed') then raise check_violation using message='Invalid completion'; end if;
 update public.scout_runs set status=p_summary->>'status',completed_at=now(),summary=p_summary where id=p_run;
 if p_checkpoint is not null and p_summary->>'status'='succeeded' then update public.scout_settings set discovery_checkpoint=greatest(discovery_checkpoint,p_checkpoint) where owner_id=r.owner_id; end if;
end $$;
revoke all on function public.scout_begin(text),public.scout_reserve(uuid,text,integer),public.scout_save_listing(uuid,jsonb,jsonb),public.scout_finish(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.scout_begin(text),public.scout_reserve(uuid,text,integer),public.scout_save_listing(uuid,jsonb,jsonb),public.scout_finish(uuid,jsonb,timestamptz) to service_role;
grant select,update on private.app_owner to service_role;
commit;
