-- Trusted operations. All helpers are revoked explicitly at the end.
create function public.require_admin() returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;end $$;
create function public.commerce_throttle(p_action text,p_limit integer) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare n integer;begin
 insert into public.commerce_rate_limits(subject,action,bucket) values(auth.uid()::text,p_action,date_trunc('minute',clock_timestamp()))
 on conflict(subject,action,bucket) do update set attempts=commerce_rate_limits.attempts+1 returning attempts into n;
 if n>p_limit then raise exception 'TRY_LATER';end if;
end $$;
create function public.prepare_checkout(p_items jsonb,p_delivery jsonb,p_coupon text,p_customer uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare i jsonb; d jsonb; lines jsonb:='[]'; demand jsonb; v record; cp public.coupons%rowtype;
 subtotal bigint:=0; shipping bigint; discount bigint:=0; eligible bigint:=0; price integer; item_name text; sku text;
 coupon_id uuid; v_customer_key text; qty integer; size integer; total_qty integer:=0; matches integer;
begin
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
 -- Lock requested offers first; admin composition edits take the same lock.
 perform 1 from public.offers o where o.id in(select x->>'id' from jsonb_array_elements(p_items)x where x->>'kind'='offer') order by o.id for share;
 if exists(select 1 from jsonb_array_elements(p_items)x where x->>'kind'='offer' and not exists(select 1 from public.offer_components c where c.offer_id=x->>'id')) then raise exception 'COMBO_NOT_CONFIGURED';end if;
 select jsonb_agg(jsonb_build_object('product_id',product_id,'size_ml',size_ml,'quantity',quantity)) into demand from (
  select product_id,size_ml,sum(quantity)::integer quantity from (
   select x->>'id' product_id,(x->>'size_ml')::integer size_ml,(x->>'quantity')::integer quantity from jsonb_array_elements(p_items)x where x->>'kind'='product'
   union all select c.product_id,c.size_ml,c.quantity*(x->>'quantity')::integer from jsonb_array_elements(p_items)x join public.offer_components c on c.offer_id=x->>'id' where x->>'kind'='offer'
  ) expanded group by product_id,size_ml
 ) grouped;
 if demand is null then raise exception 'INVALID_ITEMS';end if;
 -- Stable lock order and aggregate demand prevent overselling across cart lines/bundles.
 perform 1 from public.products p where p.id in(select x->>'product_id' from jsonb_array_elements(demand)x) order by p.id for share;
 perform 1 from public.product_prices pp join jsonb_to_recordset(demand) as x(product_id text,size_ml integer,quantity integer) using(product_id,size_ml) order by pp.product_id,pp.size_ml for update of pp;
 for v in select x.*,pp.available_quantity,pp.active variant_active,p.active product_active from jsonb_to_recordset(demand) as x(product_id text,size_ml integer,quantity integer)
  left join public.product_prices pp using(product_id,size_ml) left join public.products p on p.id=x.product_id loop
  if v.product_active is distinct from true or v.variant_active is distinct from true then raise exception 'PRODUCT_UNAVAILABLE';end if;
  if v.available_quantity is null then raise exception 'STOCK_NOT_CONFIGURED';end if;
  if v.quantity>v.available_quantity then raise exception 'INSUFFICIENT_STOCK';end if;
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
 return jsonb_build_object('items',lines,'demand',demand,'delivery',d,'subtotal_inr',subtotal,'shipping_inr',shipping,'discount_inr',discount,'total_inr',subtotal+shipping-discount,'coupon_id',coupon_id,'customer_key',v_customer_key,'currency','INR');
end $$;

create function public.checkout_quote_hash(p_quote jsonb) returns text language sql immutable set search_path=pg_catalog as $$ select md5((p_quote-'demand'-'customer_key')::text) $$;
create function public.quote_checkout(p_items jsonb,p_delivery jsonb,p_coupon text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare q jsonb;begin if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;perform public.commerce_throttle('quote',30);q:=public.prepare_checkout(p_items,p_delivery,p_coupon,auth.uid());return (q-'demand'-'customer_key')||jsonb_build_object('quote_hash',public.checkout_quote_hash(q));end $$;

create function public.checkout_internal(p_customer uuid,p_items jsonb,p_delivery jsonb,p_request_key uuid,p_coupon text default null,p_quote_hash text default null)
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
 for x in select value from jsonb_array_elements(prepared->'demand') loop
  update public.product_prices set available_quantity=available_quantity-(x->>'quantity')::integer where product_id=x->>'product_id' and size_ml=(x->>'size_ml')::integer;
  insert into public.stock_movements(order_id,product_id,size_ml,delta,reason,actor_id) values(oid,x->>'product_id',(x->>'size_ml')::integer,-(x->>'quantity')::integer,'reservation',p_customer);
 end loop;
 if prepared->>'coupon_id' is not null then insert into public.coupon_redemptions(order_id,coupon_id,customer_key) values(oid,(prepared->>'coupon_id')::uuid,prepared->>'customer_key');end if;
 insert into public.order_status_events(order_id,status,actor_id) values(oid,'pending',p_customer);
 return oid;
end $$;
create function public.checkout_order(p_items jsonb,p_delivery jsonb,p_request_key uuid,p_coupon text default null,p_quote_hash text default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
begin if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;return public.checkout_internal(auth.uid(),p_items,p_delivery,p_request_key,p_coupon,p_quote_hash);end $$;
-- Close the legacy path: it has no inventory or retry key.
drop function public.create_customer_order(jsonb,jsonb);

create function public.release_order_inventory(p_order_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.customer_orders%rowtype; m record;begin
 select * into o from public.customer_orders where id=p_order_id for update;
 if not found or o.inventory_released_at is not null then return;end if;
 for m in select * from public.stock_movements where order_id=p_order_id and reason='reservation' order by product_id,size_ml loop
  update public.product_prices set available_quantity=available_quantity-m.delta where product_id=m.product_id and size_ml=m.size_ml;
  insert into public.stock_movements(order_id,product_id,size_ml,delta,reason,actor_id) values(p_order_id,m.product_id,m.size_ml,-m.delta,'release',auth.uid()) on conflict(order_id,product_id,size_ml,reason) do nothing;
 end loop;
 update public.customer_orders set inventory_released_at=now() where id=p_order_id;
 update public.coupon_redemptions set released=true where order_id=p_order_id;
end $$;
create function public.admin_update_order(p_order_id uuid,p_status text,p_tracking jsonb default '{}') returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.customer_orders%rowtype; allowed boolean;begin
 perform public.require_admin();select * into o from public.customer_orders where id=p_order_id for update;if not found then raise exception 'ORDER_NOT_FOUND';end if;
 allowed:=p_status=o.status or (o.status='pending' and p_status in ('confirmed','cancelled')) or (o.status='confirmed' and p_status in ('packed','cancelled')) or (o.status='packed' and p_status in ('shipped','cancelled')) or (o.status='shipped' and p_status='delivered') or (o.status in ('delivered','cancelled') and p_status='refunded' and o.payment_status='refunded');
 if not allowed then raise exception 'INVALID_STATUS_TRANSITION';end if;
 if p_status in ('packed','shipped','delivered') and o.payment_status not in ('paid','partially_refunded') then raise exception 'PAYMENT_REQUIRED';end if;
 update public.customer_orders set status=p_status,
  tracking_number=case when p_tracking?'tracking_number' then nullif(btrim(p_tracking->>'tracking_number'),'') else tracking_number end,
  courier_name=case when p_tracking?'courier_name' then nullif(btrim(p_tracking->>'courier_name'),'') else courier_name end,
  tracking_url=case when p_tracking?'tracking_url' then nullif(btrim(p_tracking->>'tracking_url'),'') else tracking_url end,
  estimated_delivery=case when p_tracking?'estimated_delivery' then nullif(p_tracking->>'estimated_delivery','')::date else estimated_delivery end
 where id=p_order_id;
 if p_status<>o.status then insert into public.order_status_events(order_id,status,actor_id) values(p_order_id,p_status,auth.uid());end if;
 if p_status='cancelled' and o.status<>'cancelled' then perform public.release_order_inventory(p_order_id);end if;
 insert into public.admin_audit_log(actor_id,action,entity_id,changes) values(auth.uid(),'order_update',p_order_id::text,jsonb_build_object('from',o.status,'to',p_status,'tracking',p_tracking));
end $$;
create function public.expire_order_reservations() returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare o record;n integer:=0;begin
 for o in select id from public.customer_orders where status='pending' and payment_status in ('unpaid','pending','failed','cancelled') and reservation_expires_at<now() and inventory_released_at is null order by reservation_expires_at for update skip locked limit 100 loop
  update public.customer_orders set status='cancelled' where id=o.id;
  perform public.release_order_inventory(o.id);
  insert into public.order_status_events(order_id,status) values(o.id,'cancelled');n:=n+1;
 end loop;return n;
end $$;

create function public.admin_save_product(p_data jsonb) returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare pid text:=p_data->>'id';begin
 perform public.require_admin();
 if pid !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(pid)>100 or char_length(btrim(coalesce(p_data->>'name',''))) not between 1 and 120 or char_length(coalesce(p_data->>'description',''))>5000 then raise exception 'INVALID_PRODUCT';end if;
 if (p_data->>'image_path') !~ '^(assets/[a-zA-Z0-9._/-]+|https://lshwmudskeeknmcxlffe[.]supabase[.]co/storage/v1/object/public/catalogue-media/[a-zA-Z0-9._/-]+)$' or p_data->>'image_path' like '%..%' then raise exception 'INVALID_IMAGE';end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(p_data->'gallery_paths','[]')) x where x !~ '^(assets/[a-zA-Z0-9._/-]+|https://lshwmudskeeknmcxlffe[.]supabase[.]co/storage/v1/object/public/catalogue-media/[a-zA-Z0-9._/-]+)$' or x like '%..%') then raise exception 'INVALID_IMAGE';end if;
 insert into public.products(id,name,category,gender,notes,description,image_path,gallery_paths,sizes_ml,active,sort_order,top_notes,heart_notes,base_notes,fragrance_family,longevity,projection,occasion,season,usage_information)
 values(pid,btrim(p_data->>'name'),coalesce(p_data->>'category',''),coalesce(p_data->>'gender','Unisex'),coalesce(p_data->>'notes',''),coalesce(p_data->>'description',''),p_data->>'image_path',array(select jsonb_array_elements_text(coalesce(p_data->'gallery_paths','[]'))),coalesce((select array_agg(size_ml order by size_ml) from public.product_prices where product_id=pid),array[30,50,100]),coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'sort_order')::integer,0),array(select jsonb_array_elements_text(coalesce(p_data->'top_notes','[]'))),array(select jsonb_array_elements_text(coalesce(p_data->'heart_notes','[]'))),array(select jsonb_array_elements_text(coalesce(p_data->'base_notes','[]'))),nullif(p_data->>'fragrance_family',''),nullif(p_data->>'longevity',''),nullif(p_data->>'projection',''),array(select jsonb_array_elements_text(coalesce(p_data->'occasion','[]'))),array(select jsonb_array_elements_text(coalesce(p_data->'season','[]'))),nullif(p_data->>'usage_information',''))
 on conflict(id) do update set name=excluded.name,category=excluded.category,gender=excluded.gender,notes=excluded.notes,description=excluded.description,image_path=excluded.image_path,gallery_paths=excluded.gallery_paths,active=excluded.active,sort_order=excluded.sort_order,top_notes=excluded.top_notes,heart_notes=excluded.heart_notes,base_notes=excluded.base_notes,fragrance_family=excluded.fragrance_family,longevity=excluded.longevity,projection=excluded.projection,occasion=excluded.occasion,season=excluded.season,usage_information=excluded.usage_information;
 insert into public.admin_audit_log(actor_id,action,entity_id) values(auth.uid(),'product_save',pid);return pid;
end $$;
create function public.admin_save_variant(p_data jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare pid text:=p_data->>'product_id';begin
 perform public.require_admin();
 perform 1 from public.products where id=pid for update;if not found then raise exception 'PRODUCT_UNAVAILABLE';end if;
 insert into public.product_prices(product_id,size_ml,price_inr,sku,active,low_stock_threshold) values(pid,(p_data->>'size_ml')::integer,(p_data->>'price_inr')::integer,p_data->>'sku',coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'low_stock_threshold')::integer,0))
 on conflict(product_id,size_ml) do update set price_inr=excluded.price_inr,sku=excluded.sku,active=excluded.active,low_stock_threshold=excluded.low_stock_threshold;
 update public.products set sizes_ml=(select array_agg(size_ml order by size_ml) from public.product_prices where product_id=pid) where id=pid;
 insert into public.admin_audit_log(actor_id,action,entity_id,changes) values(auth.uid(),'variant_save',pid,p_data-'available_quantity');
end $$;
create function public.admin_adjust_inventory(p_product_id text,p_size_ml integer,p_quantity integer,p_request_key uuid,p_note text default '') returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare previous integer;m public.inventory_requests%rowtype;begin
 perform public.require_admin();if p_quantity is null or p_quantity<0 or p_quantity>1000000 or p_request_key is null then raise exception 'INVALID_QUANTITY';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 select * into m from public.inventory_requests where request_key=p_request_key;
 if found then if m.product_id<>p_product_id or m.size_ml<>p_size_ml or m.quantity<>p_quantity then raise exception 'REQUEST_KEY_REUSED';end if;return;end if;
 select available_quantity into previous from public.product_prices where product_id=p_product_id and size_ml=p_size_ml for update;if not found then raise exception 'INVALID_VARIANT';end if;
 update public.product_prices set available_quantity=p_quantity where product_id=p_product_id and size_ml=p_size_ml;
 insert into public.inventory_requests(request_key,product_id,size_ml,quantity) values(p_request_key,p_product_id,p_size_ml,p_quantity);
 if p_quantity<>coalesce(previous,0) then insert into public.stock_movements(request_key,product_id,size_ml,delta,reason,actor_id,note) values(p_request_key,p_product_id,p_size_ml,p_quantity-coalesce(previous,0),'adjustment',auth.uid(),p_note);end if;
 insert into public.admin_audit_log(actor_id,action,entity_id,changes) values(auth.uid(),'inventory_set',p_product_id,jsonb_build_object('size',p_size_ml,'previous',previous,'quantity',p_quantity,'request_key',p_request_key,'note',p_note));
end $$;
create function public.admin_save_offer(p_data jsonb,p_components jsonb) returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare oid text:=p_data->>'id';x jsonb;begin
 perform public.require_admin();
 if oid !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(btrim(coalesce(p_data->>'name',''))) not between 1 and 120 then raise exception 'INVALID_OFFER';end if;
 if p_data->>'image_path' !~ '^(assets/[a-zA-Z0-9._/-]+|https://lshwmudskeeknmcxlffe[.]supabase[.]co/storage/v1/object/public/catalogue-media/[a-zA-Z0-9._/-]+)$' or p_data->>'image_path' like '%..%' then raise exception 'INVALID_IMAGE';end if;
 insert into public.offers(id,name,price_inr,badge,notes,description,image_path,active,sort_order) values(oid,p_data->>'name',(p_data->>'price_inr')::integer,coalesce(p_data->>'badge',''),coalesce(p_data->>'notes',''),coalesce(p_data->>'description',''),p_data->>'image_path',coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'sort_order')::integer,0))
 on conflict(id) do update set name=excluded.name,price_inr=excluded.price_inr,badge=excluded.badge,notes=excluded.notes,description=excluded.description,image_path=excluded.image_path,active=excluded.active,sort_order=excluded.sort_order;
 delete from public.offer_components where offer_id=oid;
 for x in select value from jsonb_array_elements(p_components) loop insert into public.offer_components(offer_id,product_id,size_ml,quantity) values(oid,x->>'product_id',(x->>'size_ml')::integer,(x->>'quantity')::integer);end loop;
 insert into public.admin_audit_log(actor_id,action,entity_id) values(auth.uid(),'offer_save',oid);return oid;
end $$;
create function public.admin_save_coupon(p_data jsonb,p_products text[] default '{}') returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare cid uuid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());begin
 perform public.require_admin();
 insert into public.coupons(id,code,kind,value,minimum_cart_inr,maximum_discount_inr,starts_at,expires_at,usage_limit,per_customer_limit,active)
 values(cid,upper(btrim(p_data->>'code')),p_data->>'kind',(p_data->>'value')::numeric,coalesce((p_data->>'minimum_cart_inr')::bigint,0),nullif(p_data->>'maximum_discount_inr','')::bigint,nullif(p_data->>'starts_at','')::timestamptz,nullif(p_data->>'expires_at','')::timestamptz,nullif(p_data->>'usage_limit','')::integer,nullif(p_data->>'per_customer_limit','')::integer,coalesce((p_data->>'active')::boolean,false))
 on conflict(id) do update set code=excluded.code,kind=excluded.kind,value=excluded.value,minimum_cart_inr=excluded.minimum_cart_inr,maximum_discount_inr=excluded.maximum_discount_inr,starts_at=excluded.starts_at,expires_at=excluded.expires_at,usage_limit=excluded.usage_limit,per_customer_limit=excluded.per_customer_limit,active=excluded.active;
 delete from public.coupon_products where coupon_id=cid;insert into public.coupon_products(coupon_id,product_id) select cid,unnest(p_products);
 insert into public.admin_audit_log(actor_id,action,entity_id) values(auth.uid(),'coupon_save',cid::text);return cid;
end $$;
create function public.submit_review(p_product_id text,p_rating integer,p_body text,p_display_name text) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare rid uuid;verified boolean;begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;perform public.commerce_throttle('review',5);
 select exists(select 1 from public.customer_order_items i join public.customer_orders o on o.id=i.order_id where i.product_id=p_product_id and o.user_id=auth.uid() and o.payment_status in ('paid','partially_refunded') and o.status not in ('cancelled','refunded')) into verified;
 insert into public.reviews(product_id,user_id,display_name,rating,body,verified_purchase) values(p_product_id,auth.uid(),btrim(p_display_name),p_rating,btrim(p_body),verified)
 on conflict(product_id,user_id) do update set display_name=excluded.display_name,rating=excluded.rating,body=excluded.body,verified_purchase=excluded.verified_purchase,status='pending' returning id into rid;return rid;
end $$;
create function public.admin_moderate_review(p_id uuid,p_status text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.require_admin();if p_status not in ('approved','rejected') then raise exception 'INVALID_STATUS';end if;update public.reviews set status=p_status where id=p_id;if not found then raise exception 'NOT_FOUND';end if;insert into public.admin_audit_log(actor_id,action,entity_id,changes) values(auth.uid(),'review_moderate',p_id::text,jsonb_build_object('status',p_status));end $$;
create function public.admin_sales_summary() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.require_admin();return jsonb_build_object('orders',(select count(*) from public.customer_orders),'pending',(select count(*) from public.customer_orders where status='pending'),'paid_revenue_inr',(select coalesce(sum(total_inr),0) from public.customer_orders where payment_status='paid'),'refund_paise',(select coalesce(sum(refunded_paise),0) from public.payment_attempts),'low_stock',(select count(*) from public.product_prices where active and available_quantity<=low_stock_threshold),'unconfigured_stock',(select count(*) from public.product_prices where available_quantity is null),'reconciliation',(select count(*) from public.customer_orders where reconciliation_required),'popular',(select coalesce(jsonb_agg(x),'[]') from (select i.product_id,sum(i.quantity) units from public.customer_order_items i join public.customer_orders o on o.id=i.order_id where o.payment_status in ('paid','partially_refunded') and o.status<>'cancelled' and i.product_id is not null group by i.product_id order by units desc limit 10)x));end $$;
create view public.product_popularity with (security_barrier=true) as select i.product_id,sum(i.quantity)::bigint units from public.customer_order_items i join public.customer_orders o on o.id=i.order_id where o.payment_status in ('paid','partially_refunded') and o.status not in ('cancelled','refunded') and i.product_id is not null group by i.product_id;
grant select on public.product_popularity to anon,authenticated;

-- Default function EXECUTE grants are unsafe for SECURITY DEFINER helpers.
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('checkout_quote_hash','require_admin','commerce_throttle','prepare_checkout','quote_checkout','checkout_internal','checkout_order','release_order_inventory','admin_update_order','expire_order_reservations','admin_save_product','admin_save_variant','admin_adjust_inventory','admin_save_offer','admin_save_coupon','submit_review','admin_moderate_review','admin_sales_summary') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in ('quote_checkout','checkout_order','admin_update_order','admin_save_product','admin_save_variant','admin_adjust_inventory','admin_save_offer','admin_save_coupon','submit_review','admin_moderate_review','admin_sales_summary') then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end $$;
grant execute on function public.checkout_internal(uuid,jsonb,jsonb,uuid,text,text),public.expire_order_reservations() to service_role;
