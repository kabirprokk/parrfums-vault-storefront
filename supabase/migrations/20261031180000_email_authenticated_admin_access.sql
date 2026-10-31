-- Admin access now follows authenticated identity membership; no AAL2/TOTP gate.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path=pg_catalog,public
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  )
$$;

-- Add the second owner-approved email account by its existing auth user ID.
-- Email addresses are intentionally not stored in source or displayed in the UI.
insert into public.admin_users(user_id)
select id from auth.users
where id in (
  '0522fd55-928f-4e02-a8e9-1928b2151601',
  'f3295e90-cde2-4df2-906a-5a45cb495a01'
)
on conflict (user_id) do nothing;
