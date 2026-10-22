-- Extend the existing catalogue/accounts, never seed business facts or inventory.
revoke create on schema public from public,anon,authenticated;
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
create policy "Read own admin membership" on public.admin_users for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.admin_users from public, anon, authenticated;
grant select on public.admin_users to authenticated;
create function public.is_admin() returns boolean language sql stable security definer set search_path=pg_catalog,public
as $$ select coalesce(auth.jwt()->>'aal','aal1')='aal2' and exists(select 1 from public.admin_users where user_id=auth.uid()) $$;
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;

alter table public.products
 add column top_notes text[], add column heart_notes text[], add column base_notes text[],
 add column fragrance_family text, add column longevity text, add column projection text,
 add column occasion text[], add column season text[], add column usage_information text;
alter table public.product_prices
 add column sku text unique,
 add column available_quantity integer check(available_quantity>=0),
 add column active boolean not null default true,
 add column low_stock_threshold integer not null default 0 check(low_stock_threshold>=0),
 add column updated_at timestamptz not null default now();
update public.product_prices set sku='PV-'||upper(product_id)||'-'||size_ml;
alter table public.product_prices alter column sku set not null;
alter table public.product_prices add constraint variant_sku_length check(char_length(sku) between 1 and 100);
-- A combo is purchasable only after its real component variants are configured.
create table public.offer_components (
 offer_id text references public.offers(id) on delete cascade,
 product_id text not null,
 size_ml integer not null,
 quantity integer not null check(quantity between 1 and 20),
 primary key(offer_id,product_id,size_ml),
 foreign key(product_id,size_ml) references public.product_prices(product_id,size_ml) on delete restrict
);
create table public.coupons (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check(code=upper(code) and code ~ '^[A-Z0-9_-]{3,40}$'),
 kind text not null check(kind in ('percentage','fixed')),
 value numeric(12,2) not null check(value>0),
 minimum_cart_inr bigint not null default 0 check(minimum_cart_inr>=0),
 maximum_discount_inr bigint check(maximum_discount_inr>0),
 starts_at timestamptz, expires_at timestamptz,
 usage_limit integer check(usage_limit>0), per_customer_limit integer check(per_customer_limit>0),
 active boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(kind<>'percentage' or value<=100), check(expires_at is null or starts_at is null or expires_at>starts_at)
);
create table public.coupon_products (
 coupon_id uuid references public.coupons(id) on delete cascade,
 product_id text references public.products(id) on delete cascade,
 primary key(coupon_id,product_id)
);
alter table public.customer_orders alter column user_id drop not null;
alter table public.customer_orders drop constraint customer_orders_user_id_fkey;
alter table public.customer_orders add constraint customer_orders_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null;
alter table public.customer_orders
 add column order_number text not null default ('PV-'||upper(replace(gen_random_uuid()::text,'-',''))) unique,
 add column email text check(email is null or (char_length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 add column discount_inr bigint not null default 0 check(discount_inr>=0 and discount_inr<=subtotal_inr),
 add column coupon_id uuid references public.coupons(id) on delete restrict,
 add column request_key uuid not null default gen_random_uuid() unique,
 add column request_fingerprint text,
 add column tracking_number text check(char_length(tracking_number)<=120),
 add column courier_name text check(char_length(courier_name)<=120),
 add column tracking_url text check(tracking_url is null or (char_length(tracking_url)<=1000 and tracking_url ~ '^https://[^[:space:]]+$')),
 add column estimated_delivery date,
 add column reservation_expires_at timestamptz,
 add column inventory_released_at timestamptz,
 add column reconciliation_required boolean not null default false,
 add column updated_at timestamptz not null default now();
alter table public.customer_orders drop constraint customer_orders_status_check;
alter table public.customer_orders add constraint customer_orders_status_check check(status in ('pending','confirmed','packed','shipped','delivered','cancelled','refunded'));
alter table public.customer_orders drop constraint customer_orders_payment_status_check;
alter table public.customer_orders add constraint customer_orders_payment_status_check check(payment_status in ('unpaid','pending','processing','paid','failed','cancelled','partially_refunded','refunded'));
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.customer_orders'::regclass and contype='c' and pg_get_constraintdef(oid) like '%total_inr =%' loop
  execute format('alter table public.customer_orders drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.customer_orders add constraint order_total_consistent check(total_inr=subtotal_inr+shipping_inr-discount_inr and total_inr>=0);
alter table public.customer_order_items add column sku text, add column metadata jsonb not null default '{}'::jsonb;
create table public.order_status_events (
 id bigint generated always as identity primary key,
 order_id uuid not null references public.customer_orders(id) on delete cascade,
 status text not null check(status in ('pending','confirmed','packed','shipped','delivered','cancelled','refunded')),
 created_at timestamptz not null default now(),
 actor_id uuid references auth.users(id) on delete set null
);
create index order_events_lookup on public.order_status_events(order_id,created_at,id);
insert into public.order_status_events(order_id,status,created_at) select id,status,created_at from public.customer_orders;
create table public.stock_movements (
 id uuid primary key default gen_random_uuid(),
 request_key uuid unique,
 order_id uuid references public.customer_orders(id) on delete restrict,
 product_id text not null, size_ml integer not null,
 delta integer not null check(delta<>0),
 reason text not null check(reason in ('reservation','release','adjustment')),
 actor_id uuid references auth.users(id) on delete set null,
 note text check(char_length(note)<=500), created_at timestamptz not null default now(),
 foreign key(product_id,size_ml) references public.product_prices(product_id,size_ml) on delete restrict,
 unique(order_id,product_id,size_ml,reason)
);
create index stock_movement_variant on public.stock_movements(product_id,size_ml,created_at desc);
create table public.inventory_requests (
 request_key uuid primary key,product_id text not null,size_ml integer not null,quantity integer not null,
 created_at timestamptz not null default now(),
 foreign key(product_id,size_ml) references public.product_prices(product_id,size_ml) on delete restrict
);
create table public.coupon_redemptions (
 order_id uuid primary key references public.customer_orders(id) on delete restrict,
 coupon_id uuid not null references public.coupons(id) on delete restrict,
 customer_key text not null, released boolean not null default false,
 created_at timestamptz not null default now()
);
create index coupon_usage_lookup on public.coupon_redemptions(coupon_id,customer_key) where not released;
create table public.admin_audit_log (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 action text not null, entity_id text not null, changes jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create table public.payment_attempts (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.customer_orders(id) on delete restrict,
 request_key uuid not null unique,
 provider text not null,
 provider_order_id text unique,
 provider_payment_id text unique,
 amount_paise bigint not null check(amount_paise>0), currency text not null default 'INR' check(currency='INR'),
 status text not null default 'pending' check(status in ('pending','processing','paid','failed','cancelled','partially_refunded','refunded')),
 refunded_paise bigint not null default 0 check(refunded_paise>=0 and refunded_paise<=amount_paise),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index payment_order_lookup on public.payment_attempts(order_id,created_at desc);
create table public.payment_events (
 provider text not null, event_id text not null check(char_length(event_id)<=250),
 attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
 status text not null, body_hash text, created_at timestamptz not null default now(),
 primary key(provider,event_id)
);
create table public.reviews (
 id uuid primary key default gen_random_uuid(),
 product_id text not null references public.products(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null check(char_length(display_name) between 1 and 60),
 rating integer not null check(rating between 1 and 5),
 body text not null check(char_length(body) between 10 and 2000),
 verified_purchase boolean not null default false,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(product_id,user_id)
);
create index approved_reviews_product on public.reviews(product_id,created_at desc) where status='approved';
create view public.public_reviews with (security_barrier=true) as
 select id,product_id,display_name,rating,body,verified_purchase,created_at from public.reviews where status='approved';
create view public.product_review_summary with (security_barrier=true) as
 select product_id,round(avg(rating),2) as average_rating,count(*)::integer as review_count from public.reviews where status='approved' group by product_id;
grant select on public.public_reviews,public.product_review_summary to anon,authenticated;
create table public.commerce_settings (
 id boolean primary key default true check(id),
 reservation_minutes integer not null default 30 check(reservation_minutes between 5 and 1440)
);
insert into public.commerce_settings(id) values(true);
create table public.commerce_rate_limits (
 subject text not null, action text not null, bucket timestamptz not null, attempts integer not null default 1,
 primary key(subject,action,bucket)
);
create index orders_admin_lookup on public.customer_orders(status,created_at desc);
create index orders_email_lookup on public.customer_orders(lower(email));
create index orders_phone_lookup on public.customer_orders(phone);
create index orders_reservations_due on public.customer_orders(reservation_expires_at) where inventory_released_at is null and status='pending';
create index catalogue_filter on public.products(active,category,created_at desc);

-- Private tables have no direct client mutation grants, including for admins.
do $$ declare t text; begin
 foreach t in array array['offer_components','coupons','coupon_products','order_status_events','stock_movements','inventory_requests','coupon_redemptions','admin_audit_log','payment_attempts','payment_events','reviews','commerce_settings','commerce_rate_limits'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
grant select on public.offer_components to anon,authenticated;
create policy "Public read offer composition" on public.offer_components for select to anon,authenticated using(exists(select 1 from public.offers where id=offer_id and active));
grant select on public.coupons,public.coupon_products,public.stock_movements,public.admin_audit_log to authenticated;
create policy "Admin read coupons" on public.coupons for select to authenticated using((select public.is_admin()));
create policy "Admin read coupon products" on public.coupon_products for select to authenticated using((select public.is_admin()));
create policy "Admin read inventory ledger" on public.stock_movements for select to authenticated using((select public.is_admin()));
create policy "Admin read audit" on public.admin_audit_log for select to authenticated using((select public.is_admin()));
create policy "Admin read products" on public.products for select to authenticated using((select public.is_admin()));
create policy "Admin read variants" on public.product_prices for select to authenticated using((select public.is_admin()));
create policy "Admin read offers" on public.offers for select to authenticated using((select public.is_admin()));
create policy "Admin read orders" on public.customer_orders for select to authenticated using((select public.is_admin()));
create policy "Admin read order lines" on public.customer_order_items for select to authenticated using((select public.is_admin()));
create policy "Admin read customer profiles" on public.customer_profiles for select to authenticated using((select public.is_admin()));
grant select on public.order_status_events,public.payment_attempts,public.reviews to authenticated;
create policy "Read permitted order events" on public.order_status_events for select to authenticated using(exists(select 1 from public.customer_orders o where o.id=order_id and (o.user_id=(select auth.uid()) or (select public.is_admin()))));
create policy "Read permitted payment attempts" on public.payment_attempts for select to authenticated using(exists(select 1 from public.customer_orders o where o.id=order_id and (o.user_id=(select auth.uid()) or (select public.is_admin()))));
create policy "Read own or moderate reviews" on public.reviews for select to authenticated using(user_id=(select auth.uid()) or (select public.is_admin()));
create function public.touch_updated_at() returns trigger language plpgsql set search_path=pg_catalog as $$ begin new.updated_at=now();return new;end $$;
do $$ declare t text; begin
 foreach t in array array['products','product_prices','offers','coupons','customer_orders','payment_attempts','reviews'] loop
  execute format('create trigger touch_updated before update on public.%I for each row execute function public.touch_updated_at()',t);
 end loop;
end $$;

-- Supabase Storage exists in hosted projects, not the isolated SQL test runtime.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  execute $q$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('catalogue-media','catalogue-media',true,10485760,array['image/jpeg','image/png','image/webp','image/avif']) on conflict(id) do nothing$q$;
  execute $q$create policy "Admin insert catalogue media" on storage.objects for insert to authenticated with check(bucket_id='catalogue-media' and public.is_admin())$q$;
  execute $q$create policy "Admin update catalogue media" on storage.objects for update to authenticated using(bucket_id='catalogue-media' and public.is_admin()) with check(bucket_id='catalogue-media' and public.is_admin())$q$;
  execute $q$create policy "Admin delete catalogue media" on storage.objects for delete to authenticated using(bucket_id='catalogue-media' and public.is_admin())$q$;
  execute $q$create policy "Read catalogue media" on storage.objects for select to anon,authenticated using(bucket_id='catalogue-media')$q$;
 end if;
end $$;
