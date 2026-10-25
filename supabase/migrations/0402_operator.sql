-- Workstream 04: operator flag gating the Generate Opportunities trigger outside DEMO_MODE (spec §6).
-- Set by hand for staff accounts; users cannot grant it to themselves.
alter table public.profiles add column if not exists is_operator boolean not null default false;

create or replace function public.profiles_protect_operator() returns trigger
language plpgsql as $$
begin
  if new.is_operator is distinct from old.is_operator and coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' then
    raise exception 'is_operator can only be changed by the service role';
  end if;
  return new;
end $$;
create trigger profiles_protect_operator before update on public.profiles
  for each row execute function public.profiles_protect_operator();
