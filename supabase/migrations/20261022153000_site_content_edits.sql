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
