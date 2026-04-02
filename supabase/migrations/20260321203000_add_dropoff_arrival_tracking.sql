alter table public.rides
  add column if not exists dropoff_arrived_at timestamptz;
