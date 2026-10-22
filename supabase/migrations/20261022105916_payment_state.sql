-- Service-only payment commands. Browser roles can never assert payment success.
create function public.begin_payment_attempt(p_order_id uuid,p_user_id uuid,p_request_key uuid,p_provider text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.customer_orders%rowtype;a public.payment_attempts%rowtype;begin
 select * into o from public.customer_orders where id=p_order_id for update;
 if not found or o.user_id is distinct from p_user_id or p_user_id is null then raise exception 'ORDER_NOT_FOUND';end if;
 if o.status in ('cancelled','refunded') or o.inventory_released_at is not null or (o.reservation_expires_at<now() and o.payment_status<>'paid') then raise exception 'ORDER_EXPIRED';end if;
 if o.payment_status in ('paid','partially_refunded','refunded') then raise exception 'ALREADY_PAID';end if;
 select * into a from public.payment_attempts where request_key=p_request_key;
 if found then if a.order_id<>p_order_id or a.provider<>p_provider then raise exception 'REQUEST_KEY_REUSED';end if;return to_jsonb(a);end if;
 -- One in-flight provider order per order, even across tabs/request keys.
 select * into a from public.payment_attempts where order_id=p_order_id and status in ('pending','processing') order by created_at desc limit 1;
 if found then return to_jsonb(a);end if;
 insert into public.payment_attempts(order_id,request_key,provider,amount_paise) values(p_order_id,p_request_key,p_provider,o.total_inr*100) returning * into a;
 update public.customer_orders set payment_status='pending' where id=p_order_id;
 return to_jsonb(a);
end $$;
create function public.attach_provider_order(p_attempt_id uuid,p_provider_order_id text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.payment_attempts%rowtype;begin
 select * into a from public.payment_attempts where id=p_attempt_id for update;
 if not found then raise exception 'PAYMENT_NOT_FOUND';end if;
 if a.provider_order_id is not null and a.provider_order_id<>p_provider_order_id then raise exception 'PROVIDER_ORDER_CONFLICT';end if;
 if char_length(p_provider_order_id) not between 1 and 120 then raise exception 'INVALID_PROVIDER_ORDER';end if;
 update public.payment_attempts set provider_order_id=p_provider_order_id,status='pending' where id=p_attempt_id;
end $$;
create function public.claim_payment_initialization(p_attempt_id uuid) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
begin update public.payment_attempts set status='processing' where id=p_attempt_id and provider_order_id is null and status='pending';return found;end $$;
create function public.record_verified_payment(p_provider text,p_event_id text,p_provider_order_id text,p_provider_payment_id text,p_status text,p_amount_paise bigint,p_currency text,p_refunded_paise bigint default 0,p_body_hash text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.payment_attempts%rowtype;o public.customer_orders%rowtype;effective text;begin
 -- Resolve the order, then lock in the same order as initiation/admin operations.
 select * into a from public.payment_attempts where provider=p_provider and provider_order_id=p_provider_order_id;
 if not found then raise exception 'PAYMENT_NOT_FOUND';end if;
 select * into o from public.customer_orders where id=a.order_id for update;
 select * into a from public.payment_attempts where id=a.id for update;
 if p_currency<>'INR' or p_amount_paise<>a.amount_paise or p_amount_paise<>o.total_inr*100 then raise exception 'PAYMENT_AMOUNT_MISMATCH';end if;
 if p_status not in ('pending','processing','paid','failed','cancelled','partially_refunded','refunded') or p_refunded_paise<0 or p_refunded_paise>a.amount_paise then raise exception 'INVALID_PAYMENT_STATE';end if;
 if nullif(p_provider_payment_id,'') is null then raise exception 'PAYMENT_REFERENCE_REQUIRED';end if;
 if a.provider_payment_id is not null and a.provider_payment_id<>p_provider_payment_id and p_status in ('paid','partially_refunded','refunded') then raise exception 'PAYMENT_REFERENCE_CONFLICT';end if;
 if exists(select 1 from public.payment_events where provider=p_provider and event_id=p_event_id and (attempt_id<>a.id or (body_hash is not null and p_body_hash is not null and body_hash<>p_body_hash))) then raise exception 'EVENT_REFERENCE_CONFLICT';end if;
 if exists(select 1 from public.payment_events where provider=p_provider and event_id=p_event_id) then return jsonb_build_object('duplicate',true,'status',a.status);end if;
 effective:=p_status;
 -- Verified captured/refund facts cannot regress due to delayed failure/pending webhooks.
 if a.status='refunded' then effective:='refunded';
 elsif a.status='partially_refunded' and p_status<>'refunded' then effective:='partially_refunded';
 elsif a.status='paid' and p_status not in ('refunded','partially_refunded') then effective:='paid';end if;
 if effective='refunded' and greatest(a.refunded_paise,p_refunded_paise)<>a.amount_paise then raise exception 'REFUND_AMOUNT_MISMATCH';end if;
 if effective='partially_refunded' and greatest(a.refunded_paise,p_refunded_paise) not between 1 and a.amount_paise-1 then raise exception 'REFUND_AMOUNT_MISMATCH';end if;
 insert into public.payment_events(provider,event_id,attempt_id,status,body_hash) values(p_provider,p_event_id,a.id,p_status,p_body_hash) on conflict(provider,event_id) do nothing;
 update public.payment_attempts set status=effective,provider_payment_id=case when effective in ('paid','partially_refunded','refunded') then coalesce(provider_payment_id,p_provider_payment_id) else provider_payment_id end,refunded_paise=greatest(refunded_paise,p_refunded_paise) where id=a.id;
 -- A late capture after cancellation is real money but must not resurrect inventory/fulfilment.
 update public.customer_orders set payment_status=case when exists(select 1 from public.payment_attempts other where other.order_id=o.id and other.id<>a.id and other.status in ('paid','partially_refunded','refunded')) then o.payment_status else effective end,
 reconciliation_required=reconciliation_required or (effective in ('paid','partially_refunded') and (inventory_released_at is not null or status in ('cancelled','refunded') or exists(select 1 from public.payment_attempts other where other.order_id=o.id and other.id<>a.id and other.status in ('paid','partially_refunded','refunded')))) where id=o.id;
 return jsonb_build_object('duplicate',false,'status',effective,'order_id',o.id);
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('begin_payment_attempt','attach_provider_order','claim_payment_initialization','record_verified_payment') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant select on public.customer_orders,public.customer_order_items,public.payment_attempts,public.admin_users to service_role;

-- Install reservation cleanup when the project's Cron extension is available.
-- Otherwise the same service-only function is callable by an authenticated scheduler.
do $$ begin
 if not exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_available_extensions where name='pg_cron') then
  execute 'create extension pg_cron with schema pg_catalog';
 end if;
 if exists(select 1 from pg_extension where extname='pg_cron') then
  execute $q$select cron.schedule('pv-expire-reservations','*/5 * * * *','select public.expire_order_reservations()')$q$;
 end if;
end $$;
update public.storefront_settings set revision='2026-10-22-commerce',updated_at=now() where id='current';
