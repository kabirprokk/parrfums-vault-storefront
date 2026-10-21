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
select p.id, sizes.size_ml, prices.price_inr
from public.products p
cross join (values (30,399), (50,799), (100,1299)) as sizes(size_ml, price_inr)
where p.id in ('angel-share','lavender-oud','candy','leather','guilty-man','vanilla-28');

insert into public.offers (id, name, price_inr, badge, notes, description, image_path, sort_order)
values
  ('festive-four', 'The Festive Four', 2600, 'Buy 2 x 100ml, get 2 x 30ml FREE', 'Lavender Oud · Leather · Guilty Man · Vanilla 28', 'Four full fragrances - two 100ml bottles and two 30ml on the house. The festive edit, ready to gift.', 'assets/offer-festive.jpg', 10),
  ('duo-plus', 'The Duo Plus', 1600, 'Buy 2 x 50ml, get 1 x 30ml FREE', 'Two 50ml bottles + one 30ml on the house', 'The everyday trio. Two 50ml bottles and a 30ml you did not pay for - the easiest way to find your signature.', 'assets/offer-duo.jpg', 20);
