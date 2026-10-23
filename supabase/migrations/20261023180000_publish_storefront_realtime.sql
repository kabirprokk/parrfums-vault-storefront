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
