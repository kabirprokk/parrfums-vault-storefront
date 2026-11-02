-- Purchase cost is private admin data and must never be added to public catalogue rows.
create table public.product_variant_costs (
  product_id text not null,
  size_ml integer not null,
  cost_inr integer not null check (cost_inr >= 0),
  primary key (product_id, size_ml),
  foreign key (product_id, size_ml)
    references public.product_prices(product_id, size_ml) on delete cascade
);

alter table public.product_variant_costs enable row level security;
revoke all on public.product_variant_costs from public, anon, authenticated;
grant select on public.product_variant_costs to authenticated;
create policy "Admins read variant costs"
  on public.product_variant_costs for select to authenticated
  using ((select public.is_admin()));

create or replace function public.admin_save_variant(p_data jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  pid text := p_data->>'product_id';
  size integer := (p_data->>'size_ml')::integer;
  cost_text text := nullif(btrim(p_data->>'cost_inr'), '');
begin
  perform public.require_admin();
  perform 1 from public.products where id=pid for update;
  if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  insert into public.product_prices(product_id,size_ml,price_inr,sku,active,low_stock_threshold)
  values(pid,size,(p_data->>'price_inr')::integer,p_data->>'sku',coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'low_stock_threshold')::integer,0))
  on conflict(product_id,size_ml) do update
    set price_inr=excluded.price_inr,sku=excluded.sku,active=excluded.active,low_stock_threshold=excluded.low_stock_threshold;
  if cost_text is null then
    delete from public.product_variant_costs where product_id=pid and size_ml=size;
  else
    insert into public.product_variant_costs(product_id,size_ml,cost_inr)
    values(pid,size,cost_text::integer)
    on conflict(product_id,size_ml) do update set cost_inr=excluded.cost_inr;
  end if;
  update public.products set sizes_ml=(select array_agg(size_ml order by size_ml) from public.product_prices where product_id=pid) where id=pid;
  insert into public.admin_audit_log(actor_id,action,entity_id,changes)
    values(auth.uid(),'variant_save',pid,p_data-'available_quantity');
end $$;

revoke all on function public.admin_save_variant(jsonb) from public,anon;
grant execute on function public.admin_save_variant(jsonb) to authenticated;
