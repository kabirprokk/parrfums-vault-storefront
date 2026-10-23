
-- ===== 20261021142939_catalogue.sql =====
-- Parrfums Vault catalogue: public read-only product and size-price data.
-- Orders and customer data deliberately remain outside this schema.

create table public.products (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  category text not null,
  gender text not null check (gender in ('Men', 'Women', 'Unisex')),
  notes text not null,
  description text not null,
  image_path text not null,
  gallery_paths text[] not null default '{}',
  sizes_ml integer[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(sizes_ml) > 0),
  check (image_path <> '')
);

create table public.product_prices (
  product_id text not null references public.products(id) on delete cascade,
  size_ml integer not null check (size_ml > 0),
  price_inr integer not null check (price_inr > 0),
  primary key (product_id, size_ml)
);

create table public.offers (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  price_inr integer not null check (price_inr > 0),
  badge text not null,
  notes text not null,
  description text not null,
  image_path text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.offers enable row level security;

create policy "Public can read active products"
  on public.products for select to anon, authenticated using (active);
create policy "Public can read prices for active products"
  on public.product_prices for select to anon, authenticated
  using (exists (
    select 1 from public.products
    where products.id = product_prices.product_id and products.active
  ));
create policy "Public can read active offers"
  on public.offers for select to anon, authenticated using (active);

revoke all on public.products, public.product_prices, public.offers from public, anon, authenticated;
grant select on public.products, public.product_prices, public.offers to anon, authenticated;

insert into public.products
  (id, name, category, gender, notes, description, image_path, gallery_paths, sizes_ml, sort_order)
values
  ('angel-share', 'Angel Share', 'Soft', 'Unisex', 'skin musk · soft florals · amber', 'The finishing touch to your everyday essentials. Angel Share is soft, warm and close to the skin - a signature scent that says more than words ever could.', 'assets/angel-1.jpg', array['assets/angel-1.jpg','assets/angel-2.jpg','assets/angel-3.jpg'], array[30,50,100], 10),
  ('lavender-oud', 'Lavender Oud', 'Oud', 'Unisex', 'lavender · oud · amber', 'A refined fragrance that brings elegance to every occasion. Cool lavender over a deep oud base - composed for celebrations, and for the ones worth remembering.', 'assets/oud-1.jpg', array['assets/oud-1.jpg','assets/oud-2.jpg','assets/oud-3.jpg'], array[30,50,100], 20),
  ('candy', 'Candy', 'Sweet', 'Women', 'sugar · caramel · vanilla', 'Playful, premium and unforgettable. Candy opens sweet and stays smooth - the kind of scent that gets remembered every day.', 'assets/candy-1.jpg', array['assets/candy-1.jpg','assets/candy-2.jpg','assets/candy-3.jpg'], array[30,50,100], 30),
  ('leather', 'Leather', 'Bold', 'Men', 'leather · smoke · spice', 'Bold and sophisticated. Worn leather over a warm smoky base - built for the man who does not need to announce himself.', 'assets/leather-1.jpg', array['assets/leather-1.jpg','assets/leather-2.jpg','assets/leather-3.jpg'], array[30,50,100], 40),
  ('guilty-man', 'Guilty Man', 'Bold', 'Men', 'bergamot · vetiver · leather', 'A composed, quietly magnetic scent. Bright bergamot and green vetiver over worn leather - sophisticated without trying too hard.', 'assets/guilty-1.jpg', array['assets/guilty-1.jpg','assets/guilty-2.jpg','assets/guilty-3.jpg'], array[30,50,100], 50),
  ('vanilla-28', 'Vanilla 28', 'Sweet', 'Women', 'vanilla · tonka · amber', 'Sweet. Smooth. Unforgettable. Vanilla 28 layers tonka and amber over a deep vanilla pod - comfort with a signature.', 'assets/vanilla-1.jpg', array['assets/vanilla-1.jpg','assets/vanilla-2.jpg','assets/vanilla-3.jpg'], array[30,50,100], 60);

insert into public.product_prices (product_id, size_ml, price_inr)
select p.id, sizes.size_ml, sizes.price_inr
from public.products p
cross join (values (30,399), (50,799), (100,1299)) as sizes(size_ml, price_inr)
where p.id in ('angel-share','lavender-oud','candy','leather','guilty-man','vanilla-28');

insert into public.offers (id, name, price_inr, badge, notes, description, image_path, sort_order)
values
  ('festive-four', 'The Festive Four', 2600, 'Buy 2 x 100ml, get 2 x 30ml FREE', 'Lavender Oud · Leather · Guilty Man · Vanilla 28', 'Four full fragrances - two 100ml bottles and two 30ml on the house. The festive edit, ready to gift.', 'assets/offer-festive.jpg', 10),
  ('duo-plus', 'The Duo Plus', 1600, 'Buy 2 x 50ml, get 1 x 30ml FREE', 'Two 50ml bottles + one 30ml on the house', 'The everyday trio. Two 50ml bottles and a 30ml you did not pay for - the easiest way to find your signature.', 'assets/offer-duo.jpg', 20);


-- ===== 20261021142958_lock_catalogue_to_read_only.sql =====
-- Remove Supabase's broad default table grants; public roles only need SELECT.
revoke all on public.products, public.product_prices, public.offers
  from public, anon, authenticated;
grant select on public.products, public.product_prices, public.offers
  to anon, authenticated;


-- ===== 20261021155808_customer_accounts.sql =====
-- Customer accounts: private profile/address/wishlist/order history.
-- All order prices are re-read from the catalogue inside the trusted RPC.

create table public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text not null default '' check (phone = '' or phone ~ '^[6-9][0-9]{9}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home' check (char_length(label) between 1 and 40),
  recipient_name text not null check (char_length(recipient_name) between 1 and 120),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  address_line1 text not null check (char_length(address_line1) between 4 and 200),
  address_line2 text not null default '' check (char_length(address_line2) <= 200),
  city text not null check (char_length(city) between 1 and 80),
  state text not null check (char_length(state) between 1 and 80),
  postal_code text not null check (postal_code ~ '^[0-9]{6}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_addresses_user_id_idx on public.customer_addresses(user_id);
create unique index customer_addresses_one_default_per_user
  on public.customer_addresses(user_id) where is_default;

create table public.wishlist_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text not null check (char_length(recipient_name) between 1 and 120),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  address_line1 text not null check (char_length(address_line1) between 4 and 200),
  address_line2 text not null default '' check (char_length(address_line2) <= 200),
  city text not null check (char_length(city) between 1 and 80),
  state text not null check (char_length(state) between 1 and 80),
  postal_code text not null check (postal_code ~ '^[0-9]{6}$'),
  subtotal_inr bigint not null check (subtotal_inr > 0),
  shipping_inr bigint not null check (shipping_inr >= 0),
  total_inr bigint not null check (total_inr = subtotal_inr + shipping_inr),
  status text not null default 'pending' check (status in ('pending','confirmed','shipped','delivered','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  created_at timestamptz not null default now()
);
create index customer_orders_user_created_idx on public.customer_orders(user_id, created_at desc);

create table public.customer_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  product_id text references public.products(id) on delete restrict,
  offer_id text references public.offers(id) on delete restrict,
  size_ml integer,
  quantity integer not null check (quantity between 1 and 20),
  item_name text not null check (char_length(item_name) between 1 and 120),
  unit_price_inr bigint not null check (unit_price_inr > 0),
  line_total_inr bigint not null check (line_total_inr = unit_price_inr * quantity),
  check (
    (product_id is not null and offer_id is null and size_ml > 0)
    or (product_id is null and offer_id is not null and size_ml is null)
  )
);
create index customer_order_items_order_id_idx on public.customer_order_items(order_id);

alter table public.customer_profiles enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.customer_orders enable row level security;
alter table public.customer_order_items enable row level security;

create policy "Customers read own profile" on public.customer_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Customers create own profile" on public.customer_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Customers update own profile" on public.customer_profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Customers manage own addresses" on public.customer_addresses
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Customers read own wishlist" on public.wishlist_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Customers add to own wishlist" on public.wishlist_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Customers remove from own wishlist" on public.wishlist_items
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Customers read own orders" on public.customer_orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Customers read own order items" on public.customer_order_items
  for select to authenticated using (
    exists (
      select 1 from public.customer_orders o
      where o.id = customer_order_items.order_id and o.user_id = (select auth.uid())
    )
  );

revoke all on public.customer_profiles, public.customer_addresses, public.wishlist_items,
  public.customer_orders, public.customer_order_items from public, anon, authenticated;
grant select, insert, update on public.customer_profiles to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
grant select, insert, delete on public.wishlist_items to authenticated;
grant select on public.customer_orders, public.customer_order_items to authenticated;

create or replace function public.create_customer_order(p_items jsonb, p_address_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
  v_address public.customer_addresses%rowtype;
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_kind text;
  v_item_id text;
  v_size integer;
  v_quantity integer;
  v_unit_price integer;
  v_item_name text;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_shipping bigint;
  v_order_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'Invalid order items' using errcode = '22023';
  end if;

  select * into v_address from public.customer_addresses
  where id = p_address_id and user_id = v_user_id;
  if not found then
    raise exception 'Saved delivery address not found' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as items(value) loop
    v_kind := v_item ->> 'kind';
    v_item_id := v_item ->> 'id';
    if coalesce(v_item ->> 'quantity', '') !~ '^[0-9]{1,2}$' then
      raise exception 'Invalid item quantity' using errcode = '22023';
    end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 20 then
      raise exception 'Item quantity is outside the allowed range' using errcode = '22023';
    end if;

    if v_kind = 'product' then
      if coalesce(v_item ->> 'size_ml', '') !~ '^[0-9]{1,4}$' then
        raise exception 'Invalid product size' using errcode = '22023';
      end if;
      v_size := (v_item ->> 'size_ml')::integer;
      select p.name, pp.price_inr into v_item_name, v_unit_price
      from public.products p
      join public.product_prices pp on pp.product_id = p.id and pp.size_ml = v_size
      where p.id = v_item_id and p.active
      for share of p, pp;
      if not found then
        raise exception 'Product or selected size is unavailable' using errcode = '22023';
      end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'kind','product','id',v_item_id,'size_ml',v_size,'quantity',v_quantity,
        'name',v_item_name,'unit_price',v_unit_price
      ));
    elsif v_kind = 'offer' then
      select o.name, o.price_inr into v_item_name, v_unit_price
      from public.offers o where o.id = v_item_id and o.active for share;
      if not found then
        raise exception 'Offer is unavailable' using errcode = '22023';
      end if;
      v_size := null;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'kind','offer','id',v_item_id,'quantity',v_quantity,
        'name',v_item_name,'unit_price',v_unit_price
      ));
    else
      raise exception 'Invalid order item type' using errcode = '22023';
    end if;

    v_line_total := v_unit_price::bigint * v_quantity::bigint;
    v_subtotal := v_subtotal + v_line_total;
    if v_subtotal > 100000000000 then
      raise exception 'Order total exceeds allowed limit' using errcode = '22023';
    end if;
  end loop;

  v_shipping := case when v_subtotal >= 999 then 0 else 79 end;
  insert into public.customer_orders (
    user_id, recipient_name, phone, address_line1, address_line2, city, state,
    postal_code, subtotal_inr, shipping_inr, total_inr
  ) values (
    v_user_id, v_address.recipient_name, v_address.phone, v_address.address_line1,
    v_address.address_line2, v_address.city, v_address.state, v_address.postal_code,
    v_subtotal, v_shipping, v_subtotal + v_shipping
  ) returning id into v_order_id;

  insert into public.customer_order_items (
    order_id, product_id, offer_id, size_ml, quantity, item_name, unit_price_inr, line_total_inr
  )
  select v_order_id,
    case when line ->> 'kind' = 'product' then line ->> 'id' end,
    case when line ->> 'kind' = 'offer' then line ->> 'id' end,
    case when line ->> 'kind' = 'product' then (line ->> 'size_ml')::integer end,
    (line ->> 'quantity')::integer,
    line ->> 'name',
    (line ->> 'unit_price')::bigint,
    (line ->> 'unit_price')::bigint * (line ->> 'quantity')::integer
  from jsonb_array_elements(v_lines) as normalized(line);

  return v_order_id;
end;
$function$;

revoke all on function public.create_customer_order(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_customer_order(jsonb, uuid) to authenticated;


-- ===== 20261021155942_order_create_from_delivery.sql =====
-- Replace the address-id RPC with a validated delivery snapshot. Addresses
-- remain explicitly opt-in in the account address book; each order keeps its
-- own immutable-at-creation shipping details.
drop function public.create_customer_order(jsonb, uuid);

create function public.create_customer_order(p_items jsonb, p_delivery jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_kind text;
  v_item_id text;
  v_size integer;
  v_quantity integer;
  v_unit_price integer;
  v_item_name text;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_shipping bigint;
  v_order_id uuid;
  v_recipient text;
  v_phone text;
  v_address1 text;
  v_address2 text;
  v_city text;
  v_state text;
  v_postal text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'Invalid order items' using errcode = '22023';
  end if;
  if p_delivery is null or jsonb_typeof(p_delivery) <> 'object' then
    raise exception 'Delivery details are required' using errcode = '22023';
  end if;

  v_recipient := btrim(coalesce(p_delivery ->> 'recipient_name', ''));
  v_phone := btrim(coalesce(p_delivery ->> 'phone', ''));
  v_address1 := btrim(coalesce(p_delivery ->> 'address_line1', ''));
  v_address2 := btrim(coalesce(p_delivery ->> 'address_line2', ''));
  v_city := btrim(coalesce(p_delivery ->> 'city', ''));
  v_state := btrim(coalesce(p_delivery ->> 'state', ''));
  v_postal := btrim(coalesce(p_delivery ->> 'postal_code', ''));
  if char_length(v_recipient) not between 1 and 120
     or v_phone !~ '^[6-9][0-9]{9}$'
     or char_length(v_address1) not between 4 and 200
     or char_length(v_address2) > 200
     or char_length(v_city) not between 1 and 80
     or char_length(v_state) not between 1 and 80
     or v_postal !~ '^[0-9]{6}$' then
    raise exception 'Invalid delivery details' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as items(value) loop
    v_kind := v_item ->> 'kind';
    v_item_id := v_item ->> 'id';
    if coalesce(v_item ->> 'quantity', '') !~ '^[0-9]{1,2}$' then
      raise exception 'Invalid item quantity' using errcode = '22023';
    end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 20 then
      raise exception 'Item quantity is outside the allowed range' using errcode = '22023';
    end if;

    if v_kind = 'product' then
      if coalesce(v_item ->> 'size_ml', '') !~ '^[0-9]{1,4}$' then
        raise exception 'Invalid product size' using errcode = '22023';
      end if;
      v_size := (v_item ->> 'size_ml')::integer;
      select p.name, pp.price_inr into v_item_name, v_unit_price
      from public.products p
      join public.product_prices pp on pp.product_id = p.id and pp.size_ml = v_size
      where p.id = v_item_id and p.active
      for share of p, pp;
      if not found then
        raise exception 'Product or selected size is unavailable' using errcode = '22023';
      end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'kind','product','id',v_item_id,'size_ml',v_size,'quantity',v_quantity,
        'name',v_item_name,'unit_price',v_unit_price
      ));
    elsif v_kind = 'offer' then
      select o.name, o.price_inr into v_item_name, v_unit_price
      from public.offers o where o.id = v_item_id and o.active for share;
      if not found then
        raise exception 'Offer is unavailable' using errcode = '22023';
      end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'kind','offer','id',v_item_id,'quantity',v_quantity,
        'name',v_item_name,'unit_price',v_unit_price
      ));
    else
      raise exception 'Invalid order item type' using errcode = '22023';
    end if;

    v_line_total := v_unit_price::bigint * v_quantity::bigint;
    v_subtotal := v_subtotal + v_line_total;
    if v_subtotal > 100000000000 then
      raise exception 'Order total exceeds allowed limit' using errcode = '22023';
    end if;
  end loop;

  v_shipping := case when v_subtotal >= 999 then 0 else 79 end;
  insert into public.customer_orders (
    user_id, recipient_name, phone, address_line1, address_line2, city, state,
    postal_code, subtotal_inr, shipping_inr, total_inr
  ) values (
    v_user_id, v_recipient, v_phone, v_address1, v_address2, v_city, v_state,
    v_postal, v_subtotal, v_shipping, v_subtotal + v_shipping
  ) returning id into v_order_id;

  insert into public.customer_order_items (
    order_id, product_id, offer_id, size_ml, quantity, item_name, unit_price_inr, line_total_inr
  )
  select v_order_id,
    case when line ->> 'kind' = 'product' then line ->> 'id' end,
    case when line ->> 'kind' = 'offer' then line ->> 'id' end,
    case when line ->> 'kind' = 'product' then (line ->> 'size_ml')::integer end,
    (line ->> 'quantity')::integer,
    line ->> 'name',
    (line ->> 'unit_price')::bigint,
    (line ->> 'unit_price')::bigint * (line ->> 'quantity')::integer
  from jsonb_array_elements(v_lines) as normalized(line);

  return v_order_id;
end;
$function$;

revoke all on function public.create_customer_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_customer_order(jsonb, jsonb) to authenticated;


-- ===== 20261022095133_owner_media_pricing_shipping.sql =====
-- Owner-confirmed catalogue, source artwork and location-based shipping.
-- Apply before deploying the matching frontend; existing order snapshots are preserved.
create table public.storefront_settings (
  id text primary key check (id = 'current'),
  revision text not null,
  updated_at timestamptz not null default now()
);
alter table public.storefront_settings enable row level security;
create policy "Public can read storefront revision" on public.storefront_settings
  for select to anon, authenticated using (true);
revoke all on public.storefront_settings from public, anon, authenticated;
grant select on public.storefront_settings to anon, authenticated;

create or replace function public.calculate_shipping(p_city text)
returns integer language sql immutable set search_path = pg_catalog
as $$ select case when lower(btrim(coalesce(p_city, ''))) in ('mumbai', 'bombay') then 100 else 120 end $$;
revoke all on function public.calculate_shipping(text) from public, anon, authenticated;
grant execute on function public.calculate_shipping(text) to authenticated;

update public.product_prices set price_inr = case size_ml when 30 then 400 when 50 then 750 when 100 then 1250 end
where size_ml in (30, 50, 100);

update public.products set name='Angel Share', gender='Unisex', notes='cinnamon · vanilla · amber', description='A warm, spicy signature with woody sweetness, vanilla, cinnamon and amber. A little warmth for your everyday ritual.', image_path='assets/media/angel-share-1080.webp', gallery_paths=array['assets/media/angel-share-1080.webp'], updated_at=now() where id='angel-share';

update public.products set name='Lavender Oud', gender='Unisex', notes='citrus · oud · warm spice', description='Citrus and oud meet warm spice, woody depth and a fresh, leathery finish. Refined and ready for the occasions worth remembering.', image_path='assets/media/lavender-oud-1080.webp', gallery_paths=array['assets/media/lavender-oud-1080.webp'], updated_at=now() where id='lavender-oud';

update public.products set name='Candy', gender='Women', notes='vanilla · fruit · amber', description='Playful fruit and vanilla, with amber, aromatic woods and a soft spicy finish. Sweet, smooth and made to be remembered.', image_path='assets/media/candy-1080.webp', gallery_paths=array['assets/media/candy-1080.webp'], updated_at=now() where id='candy';

update public.products set name='Leather', gender='Unisex', notes='leather · vanilla · amber', description='Leather, vanilla and warm spice, softened with amber and white florals. Bold, sophisticated and made for everyone.', image_path='assets/media/leather-1080.webp', gallery_paths=array['assets/media/leather-1080.webp'], updated_at=now() where id='leather';

update public.products set name='Guilty Man', gender='Men', notes='woods · citrus · fresh spice', description='Woody and fresh spicy, with aromatic citrus, lavender and white florals. A composed, quietly magnetic signature.', image_path='assets/media/guilty-man-1080.webp', gallery_paths=array['assets/media/guilty-man-1080.webp'], updated_at=now() where id='guilty-man';

update public.products set name='Vanilla 28', gender='Unisex', notes='vanilla · sweet woods · amber', description='Sweet vanilla and warm woods, with powdery musk, amber and a soft spicy finish. Comfort with a signature.', image_path='assets/media/vanilla-28-1080.webp', gallery_paths=array['assets/media/vanilla-28-1080.webp'], updated_at=now() where id='vanilla-28';

update public.offers set image_path='assets/media/combo-festive-1080.webp', notes='Choose your free fragrances: Guilty Man or Vanilla 28', description='Four full fragrances — two 100ml bottles and two 30ml on the house. The festive edit, ready to gift.', price_inr=2600, updated_at=now() where id='festive-four';

update public.offers set image_path='assets/media/combo-duo-1080.webp', notes='Choose your free fragrance: Guilty Man or Vanilla 28', description='The everyday trio. Two 50ml bottles and a 30ml you did not pay for — the easiest way to find your signature.', price_inr=1600, updated_at=now() where id='duo-plus';

create or replace function public.create_customer_order(p_items jsonb, p_delivery jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_kind text;
  v_item_id text;
  v_size integer;
  v_quantity integer;
  v_unit_price integer;
  v_item_name text;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_shipping bigint;
  v_order_id uuid;
  v_recipient text;
  v_phone text;
  v_address1 text;
  v_address2 text;
  v_city text;
  v_state text;
  v_postal text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'Invalid order items' using errcode = '22023';
  end if;
  if p_delivery is null or jsonb_typeof(p_delivery) <> 'object' then
    raise exception 'Delivery details are required' using errcode = '22023';
  end if;

  v_recipient := btrim(coalesce(p_delivery ->> 'recipient_name', ''));
  v_phone := btrim(coalesce(p_delivery ->> 'phone', ''));
  v_address1 := btrim(coalesce(p_delivery ->> 'address_line1', ''));
  v_address2 := btrim(coalesce(p_delivery ->> 'address_line2', ''));
  v_city := btrim(coalesce(p_delivery ->> 'city', ''));
  v_state := btrim(coalesce(p_delivery ->> 'state', ''));
  v_postal := btrim(coalesce(p_delivery ->> 'postal_code', ''));
  if char_length(v_recipient) not between 1 and 120
     or v_phone !~ '^[6-9][0-9]{9}$'
     or char_length(v_address1) not between 4 and 200
     or char_length(v_address2) > 200
     or char_length(v_city) not between 1 and 80
     or char_length(v_state) not between 1 and 80
     or v_postal !~ '^[0-9]{6}$' then
    raise exception 'Invalid delivery details' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as items(value) loop
    v_kind := v_item ->> 'kind';
    v_item_id := v_item ->> 'id';
    if coalesce(v_item ->> 'quantity', '') !~ '^[0-9]{1,2}$' then
      raise exception 'Invalid item quantity' using errcode = '22023';
    end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 20 then
      raise exception 'Item quantity is outside the allowed range' using errcode = '22023';
    end if;

    if v_kind = 'product' then
      if coalesce(v_item ->> 'size_ml', '') !~ '^[0-9]{1,4}$' then
        raise exception 'Invalid product size' using errcode = '22023';
      end if;
      v_size := (v_item ->> 'size_ml')::integer;
      select p.name, pp.price_inr into v_item_name, v_unit_price
      from public.products p
      join public.product_prices pp on pp.product_id = p.id and pp.size_ml = v_size
      where p.id = v_item_id and p.active
      for share of p, pp;
      if not found then
        raise exception 'Product or selected size is unavailable' using errcode = '22023';
      end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'kind','product','id',v_item_id,'size_ml',v_size,'quantity',v_quantity,
        'name',v_item_name,'unit_price',v_unit_price
      ));
    elsif v_kind = 'offer' then
      select o.name, o.price_inr into v_item_name, v_unit_price
      from public.offers o where o.id = v_item_id and o.active for share;
      if not found then
        raise exception 'Offer is unavailable' using errcode = '22023';
      end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'kind','offer','id',v_item_id,'quantity',v_quantity,
        'name',v_item_name,'unit_price',v_unit_price
      ));
    else
      raise exception 'Invalid order item type' using errcode = '22023';
    end if;

    v_line_total := v_unit_price::bigint * v_quantity::bigint;
    v_subtotal := v_subtotal + v_line_total;
    if v_subtotal > 100000000000 then
      raise exception 'Order total exceeds allowed limit' using errcode = '22023';
    end if;
  end loop;

  v_shipping := public.calculate_shipping(v_city);
  insert into public.customer_orders (
    user_id, recipient_name, phone, address_line1, address_line2, city, state,
    postal_code, subtotal_inr, shipping_inr, total_inr
  ) values (
    v_user_id, v_recipient, v_phone, v_address1, v_address2, v_city, v_state,
    v_postal, v_subtotal, v_shipping, v_subtotal + v_shipping
  ) returning id into v_order_id;

  insert into public.customer_order_items (
    order_id, product_id, offer_id, size_ml, quantity, item_name, unit_price_inr, line_total_inr
  )
  select v_order_id,
    case when line ->> 'kind' = 'product' then line ->> 'id' end,
    case when line ->> 'kind' = 'offer' then line ->> 'id' end,
    case when line ->> 'kind' = 'product' then (line ->> 'size_ml')::integer end,
    (line ->> 'quantity')::integer,
    line ->> 'name',
    (line ->> 'unit_price')::bigint,
    (line ->> 'unit_price')::bigint * (line ->> 'quantity')::integer
  from jsonb_array_elements(v_lines) as normalized(line);

  return v_order_id;
end;
$function$;

revoke all on function public.create_customer_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_customer_order(jsonb, jsonb) to authenticated;

insert into public.storefront_settings(id,revision) values ('current','2026-10-22-owner-media');


-- ===== 20261022105858_commerce_foundation.sql =====
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


-- ===== 20261022105905_checkout_inventory_admin.sql =====
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


-- ===== 20261022105916_payment_state.sql =====
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


-- ===== 20261022110040_public_projection_security.sql =====
-- Public projections must not inherit unrestricted view-owner access.
-- Narrow, typed readers live outside the exposed API schema and return only
-- approved review fields or sales aggregates, never customer/order identities.
create schema commerce_private;
revoke all on schema commerce_private from public,anon,authenticated;
grant usage on schema commerce_private to anon,authenticated;
create function commerce_private.approved_reviews()
returns table(id uuid,product_id text,display_name text,rating integer,body text,verified_purchase boolean,created_at timestamptz)
language sql stable security definer set search_path=pg_catalog,public as $$
 select r.id,r.product_id,r.display_name,r.rating,r.body,r.verified_purchase,r.created_at from public.reviews r where r.status='approved'
$$;
create function commerce_private.review_summary()
returns table(product_id text,average_rating numeric,review_count integer)
language sql stable security definer set search_path=pg_catalog,public as $$
 select r.product_id,round(avg(r.rating),2),count(*)::integer from public.reviews r where r.status='approved' group by r.product_id
$$;
create function commerce_private.popularity()
returns table(product_id text,units bigint)
language sql stable security definer set search_path=pg_catalog,public as $$
 select i.product_id,sum(i.quantity)::bigint from public.customer_order_items i join public.customer_orders o on o.id=i.order_id
 where o.payment_status in ('paid','partially_refunded') and o.status not in ('cancelled','refunded') and i.product_id is not null group by i.product_id
$$;
revoke all on all functions in schema commerce_private from public,anon,authenticated;
grant execute on all functions in schema commerce_private to anon,authenticated;
create or replace view public.public_reviews with(security_invoker=true,security_barrier=true) as select * from commerce_private.approved_reviews();
create or replace view public.product_review_summary with(security_invoker=true,security_barrier=true) as select * from commerce_private.review_summary();
create or replace view public.product_popularity with(security_invoker=true,security_barrier=true) as select * from commerce_private.popularity();
grant select on public.public_reviews,public.product_review_summary,public.product_popularity to anon,authenticated;


-- ===== 20261022114100_database_query_indexes_and_policy_consolidation.sql =====
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


-- Owner website text edits, applied for every visitor (22 October 2026).
-- Owner website text edits, shared with every visitor.
-- The admin edit mode writes here; the storefront reads and applies the
-- overrides after every render, so an edit is live for all shoppers.
create table if not exists public.site_content (
  key text primary key,
  kind text not null default 'html' check (kind in ('html','order')),
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.site_content enable row level security;
create policy "Public can read site content" on public.site_content
  for select to anon, authenticated using (true);
revoke all on public.site_content from public, anon, authenticated;
grant select on public.site_content to anon, authenticated;

create or replace function public.admin_save_site_content(p_key text, p_kind text, p_content jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.require_admin();
  if p_key is null or char_length(p_key) not between 1 and 400 then raise exception 'INVALID_KEY';end if;
  if p_kind is null or p_kind not in ('html','order') then raise exception 'INVALID_KIND';end if;
  insert into public.site_content(key,kind,content,updated_at,updated_by)
  values (p_key,p_kind,coalesce(p_content,'{}'::jsonb),now(),auth.uid())
  on conflict (key) do update set kind=excluded.kind,content=excluded.content,updated_at=now(),updated_by=excluded.updated_by;
  insert into public.admin_audit_log(actor_id,action,entity_id,changes)
  values (auth.uid(),'site_content_save',p_key,jsonb_build_object('kind',p_kind));
end $$;

create or replace function public.admin_delete_site_content(p_key text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.require_admin();
  delete from public.site_content where key=p_key;
  insert into public.admin_audit_log(actor_id,action,entity_id)
  values (auth.uid(),'site_content_delete',p_key);
end $$;

revoke all on function public.admin_save_site_content(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_site_content(text,text,jsonb) to authenticated;
revoke all on function public.admin_delete_site_content(text) from public, anon, authenticated;
grant execute on function public.admin_delete_site_content(text) to authenticated;

-- ===== 20261023180000_publish_storefront_realtime.sql =====
-- Allow subscribed storefront pages to refresh when public catalogue content changes.
-- These tables are already readable by visitors through their table policies.
do $$
declare
  publication_exists boolean := false;
  table_name text;
begin
  begin
    execute 'select exists (select 1 from pg_catalog.pg_publication where pubname = $1)'
      into publication_exists using 'supabase_realtime';
  exception when undefined_table or feature_not_supported then
    return;
  end;

  if not publication_exists then
    return;
  end if;

  foreach table_name in array array[
    'product_prices', 'products', 'offers', 'offer_components', 'site_content'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;

