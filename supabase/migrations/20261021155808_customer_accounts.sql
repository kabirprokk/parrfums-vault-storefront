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
