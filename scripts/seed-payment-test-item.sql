begin;

insert into public.products (
  id, name, category, gender, notes, description, image_path,
  gallery_paths, sizes_ml, active, sort_order
) values (
  'payment-test-item',
  'Payment Test Item',
  'Test',
  'Unisex',
  'Temporary checkout test product',
  'Test listing for verifying checkout and order emails. Selling price ₹1; shipping is calculated separately.',
  'assets/media/payment-test-item.svg',
  array['assets/media/payment-test-item.svg'],
  array[30],
  true,
  9999
)
on conflict (id) do update set
  name=excluded.name,
  category=excluded.category,
  gender=excluded.gender,
  notes=excluded.notes,
  description=excluded.description,
  image_path=excluded.image_path,
  gallery_paths=excluded.gallery_paths,
  sizes_ml=excluded.sizes_ml,
  active=true,
  sort_order=excluded.sort_order;

insert into public.product_prices (
  product_id, size_ml, price_inr, sku, available_quantity, active, low_stock_threshold
) values (
  'payment-test-item', 30, 1, 'PV-PAYMENT-TEST-ITEM-30', 5, true, 0
)
on conflict (product_id, size_ml) do update set
  price_inr=excluded.price_inr,
  sku=excluded.sku,
  available_quantity=excluded.available_quantity,
  active=true,
  low_stock_threshold=excluded.low_stock_threshold;

insert into public.product_variant_costs(product_id, size_ml, cost_inr)
values ('payment-test-item', 30, 1)
on conflict (product_id, size_ml) do update set cost_inr=excluded.cost_inr;

commit;
