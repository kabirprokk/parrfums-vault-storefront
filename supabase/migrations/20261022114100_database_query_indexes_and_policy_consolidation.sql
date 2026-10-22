-- Cover the foreign-key lookup/delete paths reported by Supabase's advisor.
create index if not exists admin_audit_actor_lookup on public.admin_audit_log(actor_id);
create index if not exists coupon_products_product_lookup on public.coupon_products(product_id);
create index if not exists order_items_offer_lookup on public.customer_order_items(offer_id);
create index if not exists order_items_product_lookup on public.customer_order_items(product_id);
create index if not exists customer_orders_coupon_lookup on public.customer_orders(coupon_id);
create index if not exists inventory_requests_variant_lookup on public.inventory_requests(product_id,size_ml);
create index if not exists offer_components_variant_lookup on public.offer_components(product_id,size_ml);
create index if not exists order_events_actor_lookup on public.order_status_events(actor_id);
create index if not exists payment_events_attempt_lookup on public.payment_events(attempt_id);
create index if not exists reviews_user_lookup on public.reviews(user_id);
create index if not exists stock_movements_actor_lookup on public.stock_movements(actor_id);
create index if not exists wishlist_product_lookup on public.wishlist_items(product_id);

-- Keep anonymous catalogue reads to active records, while giving authenticated
-- users a single policy that also grants full reads only to verified admins.
drop policy if exists "Admin read products" on public.products;
drop policy if exists "Public can read active products" on public.products;
create policy "Anon read active products" on public.products for select to anon using(active);
create policy "Authenticated read active or admin products" on public.products for select to authenticated using(active or (select public.is_admin()));

drop policy if exists "Admin read variants" on public.product_prices;
drop policy if exists "Public can read prices for active products" on public.product_prices;
create policy "Anon read prices for active products" on public.product_prices for select to anon using(exists(select 1 from public.products p where p.id=product_prices.product_id and p.active));
create policy "Authenticated read active or admin variants" on public.product_prices for select to authenticated using(exists(select 1 from public.products p where p.id=product_prices.product_id and p.active) or (select public.is_admin()));

drop policy if exists "Admin read offers" on public.offers;
drop policy if exists "Public can read active offers" on public.offers;
create policy "Anon read active offers" on public.offers for select to anon using(active);
create policy "Authenticated read active or admin offers" on public.offers for select to authenticated using(active or (select public.is_admin()));

drop policy if exists "Admin read customer profiles" on public.customer_profiles;
drop policy if exists "Customers read own profile" on public.customer_profiles;
create policy "Customers read own or admins read profiles" on public.customer_profiles for select to authenticated using(user_id=(select auth.uid()) or (select public.is_admin()));

drop policy if exists "Admin read orders" on public.customer_orders;
drop policy if exists "Customers read own orders" on public.customer_orders;
create policy "Customers read own or admins read orders" on public.customer_orders for select to authenticated using(user_id=(select auth.uid()) or (select public.is_admin()));

drop policy if exists "Admin read order lines" on public.customer_order_items;
drop policy if exists "Customers read own order items" on public.customer_order_items;
create policy "Customers read own or admins read order lines" on public.customer_order_items for select to authenticated using((select public.is_admin()) or exists(select 1 from public.customer_orders o where o.id=customer_order_items.order_id and o.user_id=(select auth.uid())));
