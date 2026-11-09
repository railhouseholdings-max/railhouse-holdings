-- Google Sheets becomes the daily feed source. Preserve existing records and owner access.
begin;
create or replace function public.scout_save_listing(p_run uuid,p_listing jsonb,p_evaluation jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.scout_runs%rowtype; v_id uuid; previous jsonb; created boolean; changed boolean; was_visible boolean; visible boolean;
begin
 select * into strict r from public.scout_runs where id=p_run and status='running' and started_at>now()-interval '10 minutes' for update;
 if jsonb_typeof(p_listing)<>'object' or octet_length(p_listing::text)>64000 or length(p_listing->>'address')>240 or coalesce(p_listing->>'status','') not in ('Active','Pending','Contingent','Sold','Off Market','Inactive','Unknown') then raise check_violation using message='Invalid listing'; end if;
 v_id:=private.ensure_property(r.owner_id,p_listing->>'address');
 select listing,(feed_visible and (first_discovered_at is not null or lifecycle='owned' or details_revision>0 or exists(select 1 from public.deals where property_id=v_id))) into previous,was_visible from public.properties where id=v_id for update;
 visible:=was_visible or coalesce(p_listing->>'provider'='Google Sheets',false) or (p_evaluation is not null and coalesce(p_evaluation->>'stage','screened')<>'screened' and p_evaluation->>'recommendation'<>'Pass');
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
create or replace function public.scout_finish(p_run uuid,p_summary jsonb,p_checkpoint timestamptz default null) returns void language plpgsql security invoker set search_path='' as $$
declare r public.scout_runs%rowtype;
begin
 select * into strict r from public.scout_runs where id=p_run and status='running' for update;
 if p_summary->>'status' not in ('succeeded','partial','failed') then raise check_violation using message='Invalid completion'; end if;
 update public.scout_runs set status=p_summary->>'status',completed_at=now(),requests=coalesce((p_summary->>'requests')::integer,requests),summary=p_summary where id=p_run;
 if p_checkpoint is not null and p_summary->>'status'='succeeded' then update public.scout_settings set discovery_checkpoint=greatest(discovery_checkpoint,p_checkpoint) where owner_id=r.owner_id; end if;
end $$;
commit;
