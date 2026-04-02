create table if not exists public.dashboard_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text,
  role text not null check (role in ('admin', 'partner')),
  partner_id uuid references public.partners(id) on delete cascade,
  password_hash text not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  last_login_at timestamptz,
  password_updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.dashboard_accounts(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint dashboard_accounts_username_lower check (username = lower(username)),
  constraint dashboard_accounts_partner_scope check (
    (role = 'admin' and partner_id is null)
    or (role = 'partner' and partner_id is not null)
  )
);

create index if not exists dashboard_accounts_role_idx
  on public.dashboard_accounts (role, is_active, created_at desc);

create unique index if not exists dashboard_accounts_partner_unique_idx
  on public.dashboard_accounts (partner_id)
  where role = 'partner';

alter table public.dashboard_accounts enable row level security;
