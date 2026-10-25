-- Test-only stand-ins for tables owned by 02 (0200_agent.sql) and 05 (0500_business.sql),
-- applied by the ws04 integration test when those migrations have not reached this branch
-- (spec §11). Every statement is guarded, so it is a no-op once the real migrations exist.

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  interests text[] not null default '{}',
  interest_categories text[] not null default '{}',
  availability_slots text[] not null default '{}',
  social_goals text[] not null default '{}',
  group_size_pref text,
  budget_min_cents int,
  budget_max_cents int,
  travel_radius_km numeric(4,1) not null default 5,
  activity_prefs text[] not null default '{}',
  dealbreakers text[] not null default '{}',
  field_sources jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;

create table if not exists public.agent_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  summary text,
  consent jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.agent_profiles enable row level security;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  category text not null,
  address text not null,
  neighborhood text,
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.businesses enable row level security;

create table if not exists public.business_capabilities (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  event_categories text[] not null default '{}',
  capacity int not null,
  min_price_cents int,
  max_price_cents int,
  hosting_slots text[] not null default '{}',
  equipment_tags text[] not null default '{}',
  formats text[] not null default '{}',
  accepts_ai_proposals boolean not null default true
);
alter table public.business_capabilities enable row level security;

notify pgrst, 'reload schema';
