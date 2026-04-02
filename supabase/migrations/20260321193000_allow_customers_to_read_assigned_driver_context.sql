drop policy if exists customers_can_read_assigned_driver_profile
on public.profiles;

create policy customers_can_read_assigned_driver_profile
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.rides r
    where r.customer_id = auth.uid()
      and r.driver_id = profiles.id
  )
);

drop policy if exists customers_can_read_assigned_driver_vehicle
on public.vehicles;

create policy customers_can_read_assigned_driver_vehicle
on public.vehicles
for select
to authenticated
using (
  exists (
    select 1
    from public.rides r
    where r.customer_id = auth.uid()
      and r.driver_id = vehicles.driver_id
  )
);

drop policy if exists customers_can_read_assigned_driver_location
on public.driver_locations;

create policy customers_can_read_assigned_driver_location
on public.driver_locations
for select
to authenticated
using (
  exists (
    select 1
    from public.rides r
    where r.customer_id = auth.uid()
      and r.driver_id = driver_locations.driver_id
      and r.status in ('accepted', 'arrived', 'on_trip', 'completed')
  )
);
