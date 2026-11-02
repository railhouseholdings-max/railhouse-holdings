-- Run in Supabase SQL Editor AFTER migration + owner bootstrap. All test data rolls back.
-- A failure aborts the transaction; ROLLBACK before retrying if your editor leaves it open.
begin;
do $$ begin
  if not exists (select 1 from private.app_owner) then raise exception 'Bootstrap the owner first'; end if;
end $$;
select set_config('railhouse.test_owner',(select user_id::text from private.app_owner),true);
select set_config('railhouse.test_deal',gen_random_uuid()::text,true);
select set_config('request.jwt.claim.sub',current_setting('railhouse.test_owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('railhouse.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare saved jsonb; original jsonb;
begin
  saved := public.save_deal(current_setting('railhouse.test_deal')::uuid,null,
    '{"address":"Security test - rolled back","status":"Reviewing","purchase_price":80000,"rehab_budget":50000,"unexpected_construction_costs":2000,"holding_costs":1500,"arv":151000,"monthly_rent":1400,"interest_rate":6.25,"refinance_ltv":75,"loan_term_years":30,"closing_costs":0,"appraisal_fee":675,"origination_percent":1.75,"closing_date":"2027-01-28","tax_escrow":0,"insurance_escrow":0,"annual_property_taxes":0,"annual_insurance":970,"management_percent":13,"monthly_capex_reserve":100,"vacancy_percent":0,"maintenance_percent":0}',
    '{"annual_flood_insurance":0,"aggregate_escrow_adjustment":0,"broker_credit":0,"lender_credit":0,"existing_loan_payoff":0,"additional_closing_costs":0,"quoted_title_premium":null,"appraisal_paid_before_closing":true,"flood_premium_paid_before_closing":true,"additional_purchase_costs":0,"buyer_credits":0}',
    '{"parcel_id":"","payable_year":2027,"annual_override":0,"evidence":{"status":"missing","message":"manual test"}}');
  if (saved->>'revision')::int <> 1 then raise exception 'Initial save failed'; end if;
  if (select annual_override from public.deal_tax_assumptions where deal_id=current_setting('railhouse.test_deal')::uuid) <> 0 then raise exception 'Zero override lost'; end if;
  select to_jsonb(d) into original from public.deals d where id=current_setting('railhouse.test_deal')::uuid;
  begin
    perform public.save_deal(current_setting('railhouse.test_deal')::uuid,0,original,'{}','{}');
    raise exception 'Stale update was accepted';
  exception when unique_violation then null;
  end;
  begin
    perform public.save_deal(current_setting('railhouse.test_deal')::uuid,1,original,
      (select to_jsonb(a) from public.deal_adjustments a where deal_id=current_setting('railhouse.test_deal')::uuid),
      '{"parcel_id":"","payable_year":2019,"annual_override":0,"evidence":{}}');
    raise exception 'Invalid tax year was accepted';
  exception when check_violation then null;
  end;
  if (select revision from public.deals where id=current_setting('railhouse.test_deal')::uuid) <> 1 then raise exception 'Failed child write did not roll back parent'; end if;
  begin
    update private.app_owner set user_id=gen_random_uuid();
    raise exception 'Owner allowlist was writable';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.deals) or exists (select 1 from public.properties) then raise exception 'Non-owner could read data'; end if;
  begin
    perform public.save_deal(gen_random_uuid(),null,'{}','{}','{}');
    raise exception 'Non-owner could write';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
  begin
    perform 1 from public.deals;
    raise exception 'Anonymous read was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_deal(gen_random_uuid(),null,'{}','{}','{}');
    raise exception 'Anonymous RPC was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
-- Success: no errors, and no test data remains. This is not run by npm test.
