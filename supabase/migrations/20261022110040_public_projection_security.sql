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
