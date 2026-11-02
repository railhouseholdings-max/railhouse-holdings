-- Initial single-owner workspace. Apply once to a NEW Supabase project.
-- No demo/user data is inserted. All amounts are USD dollars, rates are 0-100.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
create table private.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict
);
revoke all on private.app_owner from public, anon, authenticated;
-- The only SECURITY DEFINER helper reads a non-exposed, administrator-set allowlist.
create function private.is_app_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.app_owner where user_id = (select auth.uid()));
$$;
revoke all on function private.is_app_owner() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_app_owner() to authenticated;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  address text not null check (length(address) between 1 and 240),
  city text not null, state text not null, zip text not null,
  beds numeric(6,2) not null check (beds >= 0), baths numeric(6,2) not null check (baths >= 0),
  square_feet integer not null check (square_feet >= 0), year_built integer not null,
  garage text not null, lot_square_feet integer not null check (lot_square_feet >= 0),
  property_type text not null, status text not null check (status in ('Rented','Rehab','Vacant')),
  created_at timestamptz not null default now(), unique (id, owner_id)
);
create table public.property_financials (
  property_id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id),
  acquisition_date date not null, rehab_start_date date, rehab_completion_date date,
  purchase_price numeric(16,2) not null check (purchase_price >= 0),
  acquisition_closing_costs numeric(16,2) not null check (acquisition_closing_costs >= 0),
  initial_financing numeric(16,2) not null check (initial_financing >= 0),
  acquisition_cash_invested numeric(16,2) not null check (acquisition_cash_invested >= 0),
  original_rehab_budget numeric(16,2) not null check (original_rehab_budget >= 0),
  actual_rehab_cost numeric(16,2) not null check (actual_rehab_cost >= 0),
  total_cash_invested numeric(16,2) not null check (total_cash_invested >= 0),
  cash_left_in_deal numeric(16,2) not null,
  realized_cash_flow numeric(16,2) not null,
  realized_sale_proceeds numeric(16,2) not null check (realized_sale_proceeds >= 0),
  foreign key (property_id, owner_id) references public.properties(id, owner_id) on delete cascade,
  check (rehab_completion_date is null or rehab_start_date is null or rehab_completion_date >= rehab_start_date)
);
create table public.property_operations (
  property_id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id),
  management_percent numeric(7,4) not null check (management_percent between 0 and 100),
  vacancy_percent numeric(7,4) not null check (vacancy_percent between 0 and 100),
  maintenance_percent numeric(7,4) not null check (maintenance_percent between 0 and 100),
  annual_taxes numeric(16,2) not null check (annual_taxes >= 0),
  annual_insurance numeric(16,2) not null check (annual_insurance >= 0),
  monthly_other_expenses numeric(16,2) not null check (monthly_other_expenses >= 0),
  foreign key (property_id, owner_id) references public.properties(id, owner_id) on delete cascade,
  check (management_percent + vacancy_percent + maintenance_percent <= 100)
);
create table public.property_loans (
  id uuid primary key default gen_random_uuid(), property_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id), is_current boolean not null default true,
  lender text not null, original_amount numeric(16,2) not null check (original_amount >= 0),
  balance numeric(16,2) not null check (balance >= 0), interest_rate numeric(7,4) not null check (interest_rate between 0 and 100),
  term_years numeric(8,4) not null check (term_years > 0),
  monthly_principal_and_interest numeric(16,2) not null check (monthly_principal_and_interest >= 0),
  annual_taxes numeric(16,2) not null check (annual_taxes >= 0), annual_insurance numeric(16,2) not null check (annual_insurance >= 0),
  prepayment_penalty text, refinance_date date, refinance_amount numeric(16,2), refinance_costs numeric(16,2),
  foreign key (property_id, owner_id) references public.properties(id, owner_id) on delete cascade,
  check ((refinance_date is null and refinance_amount is null and refinance_costs is null) or
    (refinance_date is not null and refinance_amount is not null and refinance_costs is not null and refinance_amount >= 0 and refinance_costs >= 0))
);
create unique index property_one_current_loan on public.property_loans(property_id) where is_current;
create table public.property_leases (
  id uuid primary key default gen_random_uuid(), property_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id), is_current boolean not null default true,
  monthly_rent numeric(16,2) not null check (monthly_rent >= 0), start_date date, end_date date,
  foreign key (property_id, owner_id) references public.properties(id, owner_id) on delete cascade,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create unique index property_one_current_lease on public.property_leases(property_id) where is_current;
create table public.property_valuations (
  id uuid primary key default gen_random_uuid(), property_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id), is_current boolean not null default true,
  original_arv numeric(16,2) not null check (original_arv >= 0), appraised_value numeric(16,2) check (appraised_value >= 0),
  current_estimated_value numeric(16,2) not null check (current_estimated_value >= 0), as_of_date date not null,
  foreign key (property_id, owner_id) references public.properties(id, owner_id) on delete cascade
);
create unique index property_one_current_valuation on public.property_valuations(property_id) where is_current;

create table public.deals (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
  property_id uuid, address text not null check (length(address) between 1 and 240),
  status text not null check (status in ('Reviewing','Researching')),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  purchase_price numeric not null check (purchase_price >= 0),
  rehab_budget numeric not null check (rehab_budget >= 0),
  unexpected_construction_costs numeric not null check (unexpected_construction_costs >= 0),
  holding_costs numeric not null check (holding_costs >= 0),
  arv numeric not null check (arv >= 0),
  monthly_rent numeric not null check (monthly_rent >= 0),
  interest_rate numeric not null check (interest_rate between 0 and 100),
  refinance_ltv numeric not null check (refinance_ltv between 0 and 100),
  loan_term_years numeric not null check (loan_term_years > 0),
  closing_costs numeric not null check (closing_costs >= 0),
  appraisal_fee numeric not null check (appraisal_fee >= 0),
  origination_percent numeric not null check (origination_percent between 0 and 100),
  closing_date date not null,
  tax_escrow numeric not null check (tax_escrow >= 0),
  insurance_escrow numeric not null check (insurance_escrow >= 0),
  annual_property_taxes numeric not null check (annual_property_taxes >= 0),
  annual_insurance numeric not null check (annual_insurance >= 0),
  management_percent numeric not null check (management_percent between 0 and 100),
  monthly_capex_reserve numeric not null check (monthly_capex_reserve >= 0),
  vacancy_percent numeric not null check (vacancy_percent between 0 and 100),
  maintenance_percent numeric not null check (maintenance_percent between 0 and 100),
  unique (id, owner_id),
  foreign key (property_id, owner_id) references public.properties(id, owner_id),
  check (management_percent + vacancy_percent + maintenance_percent <= 100),
  check (mod(loan_term_years * 12, 1) = 0)
);
create index deals_owner_updated on public.deals(owner_id,updated_at desc);
create table public.deal_adjustments (
  deal_id uuid primary key, owner_id uuid not null default auth.uid() references auth.users(id),
  annual_flood_insurance numeric not null check (annual_flood_insurance >= 0),
  aggregate_escrow_adjustment numeric not null,
  broker_credit numeric not null check (broker_credit >= 0), lender_credit numeric not null check (lender_credit >= 0),
  existing_loan_payoff numeric not null check (existing_loan_payoff >= 0),
  additional_closing_costs numeric not null check (additional_closing_costs >= 0),
  quoted_title_premium numeric check (quoted_title_premium >= 0),
  appraisal_paid_before_closing boolean not null, flood_premium_paid_before_closing boolean not null,
  additional_purchase_costs numeric not null check (additional_purchase_costs >= 0),
  buyer_credits numeric not null check (buyer_credits >= 0),
  foreign key (deal_id, owner_id) references public.deals(id, owner_id) on delete cascade
);
create table public.deal_tax_assumptions (
  deal_id uuid primary key, owner_id uuid not null default auth.uid() references auth.users(id),
  parcel_id text not null check (length(parcel_id) <= 40), payable_year integer not null check (payable_year between 2020 and 2100),
  annual_override numeric(16,2) check (annual_override >= 0),
  -- Small, immutable source evidence for ONE county lookup; not application state or calculated outputs.
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) < 24000),
  foreign key (deal_id, owner_id) references public.deals(id, owner_id) on delete cascade
);

alter table public.properties enable row level security;
revoke all on public.properties from public, anon;
grant select, insert, update, delete on public.properties to authenticated;
create policy owner_only on public.properties for all to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_app_owner()))
  with check (owner_id = (select auth.uid()) and (select private.is_app_owner()));
create index properties_owner on public.properties(owner_id);

alter table public.property_financials enable row level security;
revoke all on public.property_financials from public, anon;
grant select, insert, update, delete on public.property_financials to authenticated;
create policy owner_only on public.property_financials for all to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_app_owner()))
  with check (owner_id = (select auth.uid()) and (select private.is_app_owner()));
create index property_financials_owner on public.property_financials(owner_id);

alter table public.property_operations enable row level security;
revoke all on public.property_operations from public, anon;
grant select, insert, update, delete on public.property_operations to authenticated;
create policy owner_only on public.property_operations for all to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_app_owner()))
  with check (owner_id = (select auth.uid()) and (select private.is_app_owner()));
create index property_operations_owner on public.property_operations(owner_id);

alter table public.property_loans enable row level security;
revoke all on public.property_loans from public, anon;
grant select, insert, update, delete on public.property_loans to authenticated;
create policy owner_only on public.property_loans for all to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_app_owner()))
  with check (owner_id = (select auth.uid()) and (select private.is_app_owner()));
create index property_loans_owner on public.property_loans(owner_id);

alter table public.property_leases enable row level security;
revoke all on public.property_leases from public, anon;
grant select, insert, update, delete on public.property_leases to authenticated;
create policy owner_only on public.property_leases for all to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_app_owner()))
  with check (owner_id = (select auth.uid()) and (select private.is_app_owner()));
create index property_leases_owner on public.property_leases(owner_id);

alter table public.property_valuations enable row level security;
revoke all on public.property_valuations from public, anon;
grant select, insert, update, delete on public.property_valuations to authenticated;
create policy owner_only on public.property_valuations for all to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_app_owner()))
  with check (owner_id = (select auth.uid()) and (select private.is_app_owner()));
create index property_valuations_owner on public.property_valuations(owner_id);

alter table public.deals enable row level security;
revoke all on public.deals from public, anon;
grant select, insert, update, delete on public.deals to authenticated;
create policy owner_only on public.deals for all to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_app_owner()))
  with check (owner_id = (select auth.uid()) and (select private.is_app_owner()));
create index deals_owner on public.deals(owner_id);

alter table public.deal_adjustments enable row level security;
revoke all on public.deal_adjustments from public, anon;
grant select, insert, update, delete on public.deal_adjustments to authenticated;
create policy owner_only on public.deal_adjustments for all to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_app_owner()))
  with check (owner_id = (select auth.uid()) and (select private.is_app_owner()));
create index deal_adjustments_owner on public.deal_adjustments(owner_id);

alter table public.deal_tax_assumptions enable row level security;
revoke all on public.deal_tax_assumptions from public, anon;
grant select, insert, update, delete on public.deal_tax_assumptions to authenticated;
create policy owner_only on public.deal_tax_assumptions for all to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_app_owner()))
  with check (owner_id = (select auth.uid()) and (select private.is_app_owner()));
create index deal_tax_assumptions_owner on public.deal_tax_assumptions(owner_id);

-- One transaction saves a deal, fee adjustments and tax assumptions together.
-- SECURITY INVOKER: caller JWT + RLS remain authoritative, even when calling RPC directly.
create function public.save_deal(p_id uuid, p_expected_revision bigint, p_deal jsonb, p_adjustments jsonb, p_taxes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_existing public.deals%rowtype;
  v_deal public.deals%rowtype;
  v_adjustments public.deal_adjustments%rowtype;
  v_taxes public.deal_tax_assumptions%rowtype;
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
  v_deal := jsonb_populate_record(null::public.deals, p_deal || jsonb_build_object(
    'id',p_id,'owner_id',v_owner,'property_id',v_existing.property_id,
    'created_at',coalesce(v_existing.created_at,now()),'updated_at',now(),'revision',coalesce(v_existing.revision,0)+1));
  insert into public.deals select (v_deal).* on conflict (id) do update set
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
  return jsonb_build_object('id',p_id,'revision',v_deal.revision,'updated_at',v_deal.updated_at);
end;
$$;
revoke all on function public.save_deal(uuid,bigint,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_deal(uuid,bigint,jsonb,jsonb,jsonb) to authenticated;
commit;
