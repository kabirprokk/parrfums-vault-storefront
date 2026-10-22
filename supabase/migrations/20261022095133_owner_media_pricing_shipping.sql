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
