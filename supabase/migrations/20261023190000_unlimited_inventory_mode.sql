-- The owner requested store-wide unlimited availability until real counts are
-- provided. This is a policy flag, never a fabricated bottle quantity.
alter table public.storefront_settings
  add column inventory_unlimited boolean not null default false;

update public.storefront_settings
set inventory_unlimited = true,
    updated_at = now()
where id = 'current';

create or replace function public.admin_set_inventory_mode(p_unlimited boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare previous boolean;
begin
  perform public.require_admin();
  if p_unlimited is null then raise exception 'INVALID_INVENTORY_MODE'; end if;
  select inventory_unlimited into previous
  from public.storefront_settings where id='current' for update;
  if not found then raise exception 'SETTINGS_NOT_CONFIGURED'; end if;
  if previous = p_unlimited then return; end if;

  -- Old cached quantities must never silently become current stock counts.
  if not p_unlimited then
    update public.product_prices set available_quantity = null;
  end if;

  update public.storefront_settings
  set inventory_unlimited=p_unlimited,
      updated_at=now()
  where id='current';

  insert into public.admin_audit_log(actor_id,action,entity_id,changes)
  values(auth.uid(),'inventory_mode_set','store',
    jsonb_build_object('from',previous,'to',p_unlimited));
end $$;
revoke all on function public.admin_set_inventory_mode(boolean) from public,anon,authenticated;
grant execute on function public.admin_set_inventory_mode(boolean) to authenticated;

-- Preserve authoritative prices, address checks, coupon limits and order caps;
-- only the physical stock gate is skipped while the store-wide mode is on.
create or replace function public.prepare_checkout(p_items jsonb,p_delivery jsonb,p_coupon text,p_customer uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare i jsonb; d jsonb; lines jsonb:='[]'; demand jsonb; v record; cp public.coupons%rowtype;
 subtotal bigint:=0; shipping bigint; discount bigint:=0; eligible bigint:=0; price integer; item_name text; sku text;
 coupon_id uuid; v_customer_key text; qty integer; size integer; total_qty integer:=0; matches integer;
 inventory_unlimited boolean:=false;
begin
 select coalesce(s.inventory_unlimited,false) into inventory_unlimited
 from public.storefront_settings s where s.id='current' for share;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'INVALID_ITEMS';end if;
 if jsonb_array_length(p_items) not between 1 and 50 then raise exception 'INVALID_ITEMS';end if;
 if p_delivery is null or jsonb_typeof(p_delivery)<>'object' then raise exception 'INVALID_ADDRESS';end if;
 d:=jsonb_build_object('recipient_name',btrim(coalesce(p_delivery->>'recipient_name','')),'phone',btrim(coalesce(p_delivery->>'phone','')),
  'email',lower(btrim(coalesce(p_delivery->>'email',''))),'address_line1',btrim(coalesce(p_delivery->>'address_line1','')),
  'address_line2',btrim(coalesce(p_delivery->>'address_line2','')),'city',btrim(coalesce(p_delivery->>'city','')),
  'state',btrim(coalesce(p_delivery->>'state','')),'postal_code',btrim(coalesce(p_delivery->>'postal_code','')));
 if char_length(d->>'recipient_name') not between 1 and 120 or d->>'phone' !~ '^[6-9][0-9]{9}$'
  or char_length(d->>'email') not between 3 and 254 or d->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or char_length(d->>'address_line1') not between 4 and 200 or char_length(d->>'address_line2')>200
  or char_length(d->>'city') not between 1 and 80 or char_length(d->>'state') not between 1 and 80
  or d->>'postal_code' !~ '^[1-9][0-9]{5}$' then raise exception 'INVALID_ADDRESS';end if;
 for i in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(i)<>'object' or coalesce(i->>'kind','') not in ('product','offer') or coalesce(i->>'id','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
   or coalesce(i->>'quantity','') !~ '^[0-9]{1,2}$' then raise exception 'INVALID_ITEMS';end if;
  qty:=(i->>'quantity')::integer; if qty not between 1 and 20 then raise exception 'INVALID_QUANTITY';end if;
  total_qty:=total_qty+qty;if total_qty>200 then raise exception 'INVALID_QUANTITY';end if;
  if i->>'kind'='product' and coalesce(i->>'size_ml','') !~ '^[1-9][0-9]{0,3}$' then raise exception 'INVALID_VARIANT';end if;
 end loop;
 perform 1 from public.offers o where o.id in(select x->>'id' from jsonb_array_elements(p_items)x where x->>'kind'='offer') order by o.id for share;
 if exists(select 1 from jsonb_array_elements(p_items)x where x->>'kind'='offer' and not exists(select 1 from public.offer_components c where c.offer_id=x->>'id')) then raise exception 'COMBO_NOT_CONFIGURED';end if;
 select jsonb_agg(jsonb_build_object('product_id',product_id,'size_ml',size_ml,'quantity',quantity)) into demand from (
  select product_id,size_ml,sum(quantity)::integer quantity from (
   select x->>'id' product_id,(x->>'size_ml')::integer size_ml,(x->>'quantity')::integer quantity from jsonb_array_elements(p_items)x where x->>'kind'='product'
   union all select c.product_id,c.size_ml,c.quantity*(x->>'quantity')::integer from jsonb_array_elements(p_items)x join public.offer_components c on c.offer_id=x->>'id' where x->>'kind'='offer'
  ) expanded group by product_id,size_ml
 ) grouped;
 if demand is null then raise exception 'INVALID_ITEMS';end if;
 perform 1 from public.products p where p.id in(select x->>'product_id' from jsonb_array_elements(demand)x) order by p.id for share;
 perform 1 from public.product_prices pp join jsonb_to_recordset(demand) as x(product_id text,size_ml integer,quantity integer) using(product_id,size_ml) order by pp.product_id,pp.size_ml for update of pp;
 for v in select x.*,pp.available_quantity,pp.active variant_active,p.active product_active from jsonb_to_recordset(demand) as x(product_id text,size_ml integer,quantity integer)
  left join public.product_prices pp using(product_id,size_ml) left join public.products p on p.id=x.product_id loop
  if v.product_active is distinct from true or v.variant_active is distinct from true then raise exception 'PRODUCT_UNAVAILABLE';end if;
  if not inventory_unlimited then
   if v.available_quantity is null then raise exception 'STOCK_NOT_CONFIGURED';end if;
   if v.quantity>v.available_quantity then raise exception 'INSUFFICIENT_STOCK';end if;
  end if;
 end loop;
 for i in select value from jsonb_array_elements(p_items) loop
  qty:=(i->>'quantity')::integer;sku:=null;size:=null;
  if i->>'kind'='product' then
   size:=(i->>'size_ml')::integer;
   select p.name,pp.price_inr,pp.sku into item_name,price,sku from public.products p join public.product_prices pp on pp.product_id=p.id and pp.size_ml=size where p.id=i->>'id' and p.active and pp.active;
  else select o.name,o.price_inr into item_name,price from public.offers o where o.id=i->>'id' and o.active;
  end if;
  if not found then raise exception 'PRODUCT_UNAVAILABLE';end if;
  subtotal:=subtotal+price::bigint*qty;
  lines:=lines||jsonb_build_array(jsonb_build_object('kind',i->>'kind','id',i->>'id','size_ml',size,'quantity',qty,'item_name',item_name,'unit_price_inr',price,'line_total_inr',price::bigint*qty,'sku',sku));
 end loop;
 if subtotal>10000000 then raise exception 'ORDER_LIMIT_EXCEEDED';end if;
 v_customer_key:=coalesce(p_customer::text,'email:'||(d->>'email'));
 if nullif(btrim(p_coupon),'') is not null then
  select * into cp from public.coupons where code=upper(btrim(p_coupon)) for update;
  if not found or not cp.active or (cp.starts_at is not null and cp.starts_at>clock_timestamp()) or (cp.expires_at is not null and cp.expires_at<=clock_timestamp()) then raise exception 'INVALID_COUPON';end if;
  if subtotal<cp.minimum_cart_inr then raise exception 'COUPON_MINIMUM';end if;
  if cp.usage_limit is not null and (select count(*) from public.coupon_redemptions where coupon_redemptions.coupon_id=cp.id and not released)>=cp.usage_limit then raise exception 'COUPON_LIMIT';end if;
  if cp.per_customer_limit is not null and (select count(*) from public.coupon_redemptions r where r.coupon_id=cp.id and r.customer_key=v_customer_key and not released)>=cp.per_customer_limit then raise exception 'COUPON_LIMIT';end if;
  if exists(select 1 from public.coupon_products where coupon_products.coupon_id=cp.id) then
   select coalesce(sum((x->>'line_total_inr')::bigint),0) into eligible from jsonb_array_elements(lines)x where x->>'kind'='product' and exists(select 1 from public.coupon_products r where r.coupon_id=cp.id and r.product_id=x->>'id');
  else eligible:=subtotal;end if;
  if eligible=0 then raise exception 'COUPON_PRODUCTS';end if;
  discount:=least(eligible,case when cp.kind='percentage' then floor(eligible*cp.value/100)::bigint else floor(cp.value)::bigint end,coalesce(cp.maximum_discount_inr,eligible));coupon_id:=cp.id;
 end if;
 shipping:=public.calculate_shipping(d->>'city');
 return jsonb_build_object('items',lines,'demand',demand,'delivery',d,'subtotal_inr',subtotal,'shipping_inr',shipping,'discount_inr',discount,'total_inr',subtotal+shipping-discount,'coupon_id',coupon_id,'customer_key',v_customer_key,'currency','INR','inventory_unlimited',inventory_unlimited);
end $$;

create or replace function public.checkout_internal(p_customer uuid,p_items jsonb,p_delivery jsonb,p_request_key uuid,p_coupon text default null,p_quote_hash text default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare prepared jsonb; fingerprint text; existing public.customer_orders%rowtype; oid uuid; x jsonb; minutes integer;
begin
 if p_request_key is null then raise exception 'REQUEST_KEY_REQUIRED';end if;
 fingerprint:=md5(jsonb_build_object('items',p_items,'delivery',p_delivery,'coupon',upper(coalesce(p_coupon,'')))::text);
 perform pg_advisory_xact_lock(hashtextextended(coalesce(p_customer::text,'guest')||fingerprint,0));
 perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 select * into existing from public.customer_orders where request_key=p_request_key;
 if found then
  if existing.user_id is distinct from p_customer or existing.request_fingerprint is distinct from fingerprint then raise exception 'REQUEST_KEY_REUSED';end if;
  return existing.id;
 end if;
 select * into existing from public.customer_orders where user_id is not distinct from p_customer and request_fingerprint=fingerprint and status='pending' and inventory_released_at is null and reservation_expires_at>now() order by created_at limit 1;
 if found then return existing.id;end if;
 if p_customer is not null then perform public.commerce_throttle('checkout',10);end if;
 prepared:=public.prepare_checkout(p_items,p_delivery,p_coupon,p_customer);
 if p_quote_hash is not null and p_quote_hash<>public.checkout_quote_hash(prepared) then raise exception 'PRICING_CHANGED';end if;
 select reservation_minutes into minutes from public.commerce_settings where id;
 insert into public.customer_orders(user_id,recipient_name,phone,email,address_line1,address_line2,city,state,postal_code,subtotal_inr,shipping_inr,discount_inr,total_inr,coupon_id,request_key,request_fingerprint,reservation_expires_at)
 values(p_customer,prepared#>>'{delivery,recipient_name}',prepared#>>'{delivery,phone}',prepared#>>'{delivery,email}',prepared#>>'{delivery,address_line1}',prepared#>>'{delivery,address_line2}',prepared#>>'{delivery,city}',prepared#>>'{delivery,state}',prepared#>>'{delivery,postal_code}',(prepared->>'subtotal_inr')::bigint,(prepared->>'shipping_inr')::bigint,(prepared->>'discount_inr')::bigint,(prepared->>'total_inr')::bigint,(prepared->>'coupon_id')::uuid,p_request_key,fingerprint,now()+make_interval(mins=>minutes)) returning id into oid;
 for x in select value from jsonb_array_elements(prepared->'items') loop
  insert into public.customer_order_items(order_id,product_id,offer_id,size_ml,quantity,item_name,unit_price_inr,line_total_inr,sku,metadata)
  values(oid,case when x->>'kind'='product' then x->>'id' end,case when x->>'kind'='offer' then x->>'id' end,(x->>'size_ml')::integer,(x->>'quantity')::integer,x->>'item_name',(x->>'unit_price_inr')::bigint,(x->>'line_total_inr')::bigint,x->>'sku',case when x->>'kind'='offer' then jsonb_build_object('components',(select jsonb_agg(jsonb_build_object('product_id',c.product_id,'size_ml',c.size_ml,'quantity',c.quantity,'sku',pp.sku,'item_name',p.name) order by c.product_id,c.size_ml) from public.offer_components c join public.product_prices pp using(product_id,size_ml) join public.products p on p.id=c.product_id where c.offer_id=x->>'id')) else '{}'::jsonb end);
 end loop;
 if not coalesce((prepared->>'inventory_unlimited')::boolean,false) then
  for x in select value from jsonb_array_elements(prepared->'demand') loop
   update public.product_prices set available_quantity=available_quantity-(x->>'quantity')::integer where product_id=x->>'product_id' and size_ml=(x->>'size_ml')::integer;
   insert into public.stock_movements(order_id,product_id,size_ml,delta,reason,actor_id) values(oid,x->>'product_id',(x->>'size_ml')::integer,-(x->>'quantity')::integer,'reservation',p_customer);
  end loop;
 end if;
 if prepared->>'coupon_id' is not null then insert into public.coupon_redemptions(order_id,coupon_id,customer_key) values(oid,(prepared->>'coupon_id')::uuid,prepared->>'customer_key');end if;
 insert into public.order_status_events(order_id,status,actor_id) values(oid,'pending',p_customer);
 return oid;
end $$;

create or replace function public.admin_sales_summary() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.require_admin();
 return jsonb_build_object(
  'orders',(select count(*) from public.customer_orders),
  'pending',(select count(*) from public.customer_orders where status='pending'),
  'paid_revenue_inr',(select coalesce(sum(total_inr),0) from public.customer_orders where payment_status='paid'),
  'refund_paise',(select coalesce(sum(refunded_paise),0) from public.payment_attempts),
  'low_stock',case when coalesce((select inventory_unlimited from public.storefront_settings where id='current'),false) then 0 else (select count(*) from public.product_prices where active and available_quantity<=low_stock_threshold) end,
  'unconfigured_stock',case when coalesce((select inventory_unlimited from public.storefront_settings where id='current'),false) then 0 else (select count(*) from public.product_prices where available_quantity is null) end,
  'reconciliation',(select count(*) from public.customer_orders where reconciliation_required),
  'popular',(select coalesce(jsonb_agg(x),'[]') from (select i.product_id,sum(i.quantity) units from public.customer_order_items i join public.customer_orders o on o.id=i.order_id where o.payment_status in ('paid','partially_refunded') and o.status<>'cancelled' and i.product_id is not null group by i.product_id order by units desc limit 10)x)
 );
end $$;

-- Notify already-open storefronts when the owner changes the inventory mode.
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.storefront_settings';
  exception when duplicate_object then null;
  when undefined_object or feature_not_supported then null;
  end;
end $$;

