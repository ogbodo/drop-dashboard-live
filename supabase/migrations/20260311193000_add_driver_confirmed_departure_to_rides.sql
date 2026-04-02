alter table public.rides
add column if not exists driver_confirmed_departure boolean not null default false;
