-- The temporary payment test item is free of shipping only when it is the sole
-- product/offer recipe in the cart. Any cart with another product keeps normal
-- city-based shipping. This is enforced in the server-generated checkout quote.
create or replace function public.prepare_checkout(p_items jsonb,p_delivery jsonb,p_coupon text,p_customer uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 i jsonb; d jsonb; lines jsonb:='[]'; demand jsonb; v record; cp public.coupons%rowtype;
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
 if not exists (
   select 1 from jsonb_array_elements(demand) x where x->>'product_id'<>'payment-test-item'
 ) then shipping:=0;
 else shipping:=public.calculate_shipping(d->>'city');
 end if;
 return jsonb_build_object('items',lines,'demand',demand,'delivery',d,'subtotal_inr',subtotal,'shipping_inr',shipping,'discount_inr',discount,'total_inr',subtotal+shipping-discount,'coupon_id',coupon_id,'customer_key',v_customer_key,'currency','INR','inventory_unlimited',inventory_unlimited);
end $$;
