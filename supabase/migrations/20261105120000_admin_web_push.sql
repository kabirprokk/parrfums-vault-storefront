create table public.admin_push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%'),
  subscription jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.admin_push_subscriptions enable row level security;
revoke all on public.admin_push_subscriptions from public, anon, authenticated;
grant all on public.admin_push_subscriptions to service_role;

create table public.admin_push_events (
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  event_type text not null check (event_type in ('placed', 'paid')),
  created_at timestamptz not null default now(),
  primary key (order_id, event_type)
);
alter table public.admin_push_events enable row level security;
revoke all on public.admin_push_events from public, anon, authenticated;
grant all on public.admin_push_events to service_role;
