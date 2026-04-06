alter table public.dashboard_accounts
  add column if not exists role_title text;

alter table public.dashboard_accounts
  drop constraint if exists dashboard_accounts_role_check;

alter table public.dashboard_accounts
  drop constraint if exists dashboard_accounts_partner_scope;

alter table public.dashboard_accounts
  add constraint dashboard_accounts_role_check
  check (role in ('super_admin', 'admin', 'staff', 'partner'));

alter table public.dashboard_accounts
  add constraint dashboard_accounts_partner_scope check (
    (role in ('super_admin', 'admin', 'staff') and partner_id is null)
    or (role = 'partner' and partner_id is not null)
  );

update public.dashboard_accounts
set
  role = 'super_admin',
  role_title = coalesce(role_title, 'Super admin')
where
  role = 'admin'
  and coalesce(metadata ->> 'bootstrap', 'false') = 'true';

update public.dashboard_accounts
set role_title = case
  when role = 'super_admin' then coalesce(role_title, 'Super admin')
  when role = 'admin' then coalesce(role_title, 'Admin')
  when role = 'partner' then coalesce(role_title, 'Partner')
  else role_title
end
where role in ('super_admin', 'admin', 'partner');
