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
