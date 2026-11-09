-- Unknown actuals remain NULL; owning a property does not establish a lease or current balance.
begin;
alter table public.properties add column actuals_evidence jsonb not null default '{}' check(jsonb_typeof(actuals_evidence)='object');
alter table public.properties drop constraint properties_status_check;
alter table public.properties add constraint properties_status_check check(status in ('Rented','Rehab','Vacant','Owned'));
alter table public.property_operations add column target_monthly_rent numeric(16,2) check(target_monthly_rent>=0);
alter table public.property_loans add column balance_as_of date;
alter table public.property_financials alter column acquisition_date drop not null, alter column purchase_price drop not null, alter column acquisition_closing_costs drop not null, alter column initial_financing drop not null, alter column acquisition_cash_invested drop not null, alter column original_rehab_budget drop not null, alter column actual_rehab_cost drop not null, alter column rehab_start_date drop not null, alter column rehab_completion_date drop not null, alter column total_cash_invested drop not null, alter column cash_left_in_deal drop not null, alter column realized_cash_flow drop not null, alter column realized_sale_proceeds drop not null;
alter table public.property_operations alter column management_percent drop not null, alter column vacancy_percent drop not null, alter column maintenance_percent drop not null, alter column annual_taxes drop not null, alter column annual_insurance drop not null, alter column monthly_other_expenses drop not null;
alter table public.property_loans alter column original_amount drop not null, alter column balance drop not null, alter column interest_rate drop not null, alter column term_years drop not null, alter column monthly_principal_and_interest drop not null, alter column annual_taxes drop not null, alter column annual_insurance drop not null, alter column prepayment_penalty drop not null, alter column refinance_date drop not null, alter column refinance_amount drop not null, alter column refinance_costs drop not null;
alter table public.property_valuations alter column original_arv drop not null, alter column appraised_value drop not null, alter column current_estimated_value drop not null, alter column as_of_date drop not null;
create table public.property_actuals_history (
  id uuid primary key default gen_random_uuid(),property_id uuid not null,owner_id uuid not null default auth.uid(),
  recorded_at timestamptz not null default now(),revision bigint not null,snapshot jsonb not null,
  foreign key(property_id,owner_id) references public.properties(id,owner_id) on delete cascade
);
alter table public.property_actuals_history enable row level security;
create policy owner_read on public.property_actuals_history for select to authenticated using(owner_id=auth.uid() and private.is_app_owner());
grant select on public.property_actuals_history to authenticated;
-- The owner-only routine supplies the validated snapshot atomically, including its immutable audit entry.
create function public.save_owned_property(p_id uuid,p_revision bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.properties; b public.properties; f public.property_financials; o public.property_operations; l public.property_loans; v public.property_valuations; lease public.property_leases; current_id uuid; next_revision bigint;
begin
 if not private.is_app_owner() then raise exception 'Owner access required'; end if;
 select * into p from public.properties where id=p_id and owner_id=auth.uid() for update;
 if p.id is null or p.lifecycle<>'owned' then raise exception 'Owned property not found'; end if;
 if p.details_revision<>p_revision then raise exception 'Property changed in another session. Reload before saving.'; end if;
 b:=jsonb_populate_record(null::public.properties,p_data->'property');
 f:=jsonb_populate_record(null::public.property_financials,p_data->'finance');
 o:=jsonb_populate_record(null::public.property_operations,p_data->'operations');
 l:=jsonb_populate_record(null::public.property_loans,p_data->'loan');
 v:=jsonb_populate_record(null::public.property_valuations,p_data->'valuation');
 lease:=jsonb_populate_record(null::public.property_leases,p_data->'lease');
 if coalesce(b.address,'')='' or coalesce(b.city,'')='' or coalesce(b.state,'')='' or coalesce(b.zip,'')='' or b.status is null then raise exception 'Property address and occupancy status are required'; end if;
 next_revision:=p.details_revision+1;
 update public.properties set address=b.address, city=b.city, state=b.state, zip=b.zip, status=b.status, beds=b.beds, baths=b.baths, square_feet=b.square_feet, year_built=b.year_built, garage=b.garage, lot_square_feet=b.lot_square_feet, property_type=b.property_type,identity_key=private.property_key(case when position(',' in b.address)>0 then b.address else b.address||', '||b.city||', '||b.state end), details_revision=next_revision,updated_at=now(),ownership=ownership||jsonb_build_object('purchaseDate',f.acquisition_date,'purchasePrice',f.purchase_price) where id=p_id;
 insert into public.property_financials(property_id,owner_id,acquisition_date,purchase_price,acquisition_closing_costs,initial_financing,acquisition_cash_invested,original_rehab_budget,actual_rehab_cost,rehab_start_date,rehab_completion_date,total_cash_invested,cash_left_in_deal,realized_cash_flow,realized_sale_proceeds) values(p_id,p.owner_id,f.acquisition_date,f.purchase_price,f.acquisition_closing_costs,f.initial_financing,f.acquisition_cash_invested,f.original_rehab_budget,f.actual_rehab_cost,f.rehab_start_date,f.rehab_completion_date,f.total_cash_invested,f.cash_left_in_deal,f.realized_cash_flow,f.realized_sale_proceeds) on conflict(property_id) do update set acquisition_date=excluded.acquisition_date,purchase_price=excluded.purchase_price,acquisition_closing_costs=excluded.acquisition_closing_costs,initial_financing=excluded.initial_financing,acquisition_cash_invested=excluded.acquisition_cash_invested,original_rehab_budget=excluded.original_rehab_budget,actual_rehab_cost=excluded.actual_rehab_cost,rehab_start_date=excluded.rehab_start_date,rehab_completion_date=excluded.rehab_completion_date,total_cash_invested=excluded.total_cash_invested,cash_left_in_deal=excluded.cash_left_in_deal,realized_cash_flow=excluded.realized_cash_flow,realized_sale_proceeds=excluded.realized_sale_proceeds;
 insert into public.property_operations(property_id,owner_id,target_monthly_rent,management_percent,vacancy_percent,maintenance_percent,annual_taxes,annual_insurance,monthly_other_expenses) values(p_id,p.owner_id,o.target_monthly_rent,o.management_percent,o.vacancy_percent,o.maintenance_percent,o.annual_taxes,o.annual_insurance,o.monthly_other_expenses) on conflict(property_id) do update set target_monthly_rent=excluded.target_monthly_rent,management_percent=excluded.management_percent,vacancy_percent=excluded.vacancy_percent,maintenance_percent=excluded.maintenance_percent,annual_taxes=excluded.annual_taxes,annual_insurance=excluded.annual_insurance,monthly_other_expenses=excluded.monthly_other_expenses;
 select id into current_id from public.property_loans where property_id=p_id and is_current for update;
 if l.lender is not null and l.lender<>'' then
  if current_id is null then insert into public.property_loans(property_id,owner_id,is_current,lender,original_amount,balance,balance_as_of,interest_rate,term_years,monthly_principal_and_interest,annual_taxes,annual_insurance,prepayment_penalty,refinance_date,refinance_amount,refinance_costs) values(p_id,p.owner_id,true,l.lender,l.original_amount,l.balance,l.balance_as_of,l.interest_rate,l.term_years,l.monthly_principal_and_interest,l.annual_taxes,l.annual_insurance,l.prepayment_penalty,l.refinance_date,l.refinance_amount,l.refinance_costs);
  else update public.property_loans set lender=l.lender,original_amount=l.original_amount,balance=l.balance,balance_as_of=l.balance_as_of,interest_rate=l.interest_rate,term_years=l.term_years,monthly_principal_and_interest=l.monthly_principal_and_interest,annual_taxes=l.annual_taxes,annual_insurance=l.annual_insurance,prepayment_penalty=l.prepayment_penalty,refinance_date=l.refinance_date,refinance_amount=l.refinance_amount,refinance_costs=l.refinance_costs where id=current_id;end if;
 elsif current_id is not null then update public.property_loans set is_current=false where id=current_id;end if;
 select id into current_id from public.property_valuations where property_id=p_id and is_current for update;
 if v.current_estimated_value is not null or v.appraised_value is not null or v.original_arv is not null then
  if current_id is null then insert into public.property_valuations(property_id,owner_id,is_current,original_arv,appraised_value,current_estimated_value,as_of_date) values(p_id,p.owner_id,true,v.original_arv,v.appraised_value,v.current_estimated_value,v.as_of_date);
  else update public.property_valuations set original_arv=v.original_arv,appraised_value=v.appraised_value,current_estimated_value=v.current_estimated_value,as_of_date=v.as_of_date where id=current_id;end if;
 elsif current_id is not null then update public.property_valuations set is_current=false where id=current_id;end if;
 select id into current_id from public.property_leases where property_id=p_id and is_current for update;
 if lease.monthly_rent is not null then
  if current_id is null then insert into public.property_leases(property_id,owner_id,is_current,monthly_rent,start_date,end_date) values(p_id,p.owner_id,true,lease.monthly_rent,lease.start_date,lease.end_date);
  else update public.property_leases set monthly_rent=lease.monthly_rent,start_date=lease.start_date,end_date=lease.end_date where id=current_id;end if;
 elsif current_id is not null then update public.property_leases set is_current=false where id=current_id;end if;
 insert into public.property_actuals_history(property_id,owner_id,revision,snapshot) values(p_id,p.owner_id,next_revision,p_data);
 return jsonb_build_object('id',p_id,'revision',next_revision);
end;
$$;
revoke all on function public.save_owned_property(uuid,bigint,jsonb) from public,anon,service_role;
grant execute on function public.save_owned_property(uuid,bigint,jsonb) to authenticated;
commit;
