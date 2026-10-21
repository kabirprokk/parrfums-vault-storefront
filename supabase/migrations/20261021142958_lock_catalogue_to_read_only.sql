-- Remove Supabase's broad default table grants; public roles only need SELECT.
revoke all on public.products, public.product_prices, public.offers
  from public, anon, authenticated;
grant select on public.products, public.product_prices, public.offers
  to anon, authenticated;
