-- Workstream 07: "Bring in your Instagram taste". Suggested traits from screenshots the user
-- chose to share, their review decisions, provenance of what was added, dislikes, and plans.
-- Depends on 0100_core.sql (profiles, set_updated_at()).
-- Screenshots are never stored: only counts reach import_runs, only labels reach suggestions.

create table import_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  sources text[] not null default '{}',          -- 'your_algorithm' | 'explore' chosen by the user
  screens int not null default 0 check (screens between 0 and 4),
  stats jsonb not null default '{}',             -- counts only, never labels
  ai_used boolean not null default false,
  created_at timestamptz not null default now()
);
create index on import_runs (user_id, created_at desc);

create table trait_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  run_id uuid references import_runs(id) on delete set null,
  field text not null check (field in ('interests','activity_prefs','dislike')),
  value text not null check (char_length(value) between 1 and 64),   -- normalized tag (or label for dislikes)
  label text not null check (char_length(label) between 1 and 64),   -- what the card shows
  category text,                                                     -- EVENT_CATEGORY for interests
  confidence numeric(3,2) not null check (confidence between 0 and 1),
  band text not null check (band in ('strong','some','weak')),
  evidence jsonb not null default '[]',                              -- ≤ 3 short lines, cleared on decision
  status text not null default 'pending' check (status in ('pending','accepted','edited','rejected','expired')),
  strength text check (strength in ('love','yes')),
  edited_value text,
  model text,
  expires_at timestamptz not null default now() + interval '30 days',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index trait_suggestions_one_pending on trait_suggestions (user_id, field, value) where status = 'pending';
create index on trait_suggestions (user_id, status, created_at desc);

create table trait_provenance (
  user_id uuid not null references profiles(id) on delete cascade,
  field text not null check (field in ('interests','activity_prefs')),
  value text not null,
  origin text not null check (origin in ('import_accepted','import_edited')),
  strength text not null check (strength in ('love','yes')),
  source text not null default 'instagram_screens',
  suggestion_id uuid references trait_suggestions(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  primary key (user_id, field, value)
);

create table taste_dislikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 64),
  tag text,
  source text not null check (source in ('not_me','see_less')),
  created_at timestamptz not null default now(),
  unique (user_id, label)
);

create table import_plans (
  user_id uuid primary key references profiles(id) on delete cascade,
  cards jsonb not null default '[]',
  done jsonb not null default '[]',              -- step refs the user marked done by hand (places)
  ai_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trait_suggestions_updated before update on trait_suggestions for each row execute function set_updated_at();
create trigger import_plans_updated before update on import_plans for each row execute function set_updated_at();

alter table import_runs enable row level security;
alter table trait_suggestions enable row level security;
alter table trait_provenance enable row level security;
alter table taste_dislikes enable row level security;
alter table import_plans enable row level security;

-- Owner reads only. Every write goes through 07's server code (service role) after explicit
-- checks. No business policy on any 07 table (README privacy invariant 1).
create policy import_runs_self on import_runs for select using (auth.uid() = user_id);
create policy trait_suggestions_self on trait_suggestions for select using (auth.uid() = user_id);
create policy trait_provenance_self on trait_provenance for select using (auth.uid() = user_id);
create policy taste_dislikes_self on taste_dislikes for select using (auth.uid() = user_id);
create policy import_plans_self on import_plans for select using (auth.uid() = user_id);

-- Apply one batch of review decisions atomically. Every listed suggestion must still be pending
-- and unexpired for p_user, otherwise nothing changes and IMPORT_CONFLICT is raised.
create or replace function import_decide(p_user uuid, p_decisions jsonb, p_provenance jsonb, p_dislikes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected int := jsonb_array_length(p_decisions);
  v_updated int;
begin
  update trait_suggestions s
     set status = d.status,
         strength = d.strength,
         edited_value = d.edited_value,
         decided_at = now(),
         evidence = '[]'
    from jsonb_to_recordset(p_decisions) as d(id uuid, status text, strength text, edited_value text)
   where s.id = d.id
     and s.user_id = p_user
     and s.status = 'pending'
     and s.expires_at > now();
  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'IMPORT_CONFLICT' using errcode = 'P0001';
  end if;

  insert into trait_provenance (user_id, field, value, origin, strength, suggestion_id)
  select p_user, p.field, p.value, p.origin, p.strength, p.suggestion_id
    from jsonb_to_recordset(p_provenance) as p(field text, value text, origin text, strength text, suggestion_id uuid)
  on conflict (user_id, field, value) do update
     set origin = excluded.origin, strength = excluded.strength,
         suggestion_id = excluded.suggestion_id, confirmed_at = now();

  insert into taste_dislikes (user_id, label, tag, source)
  select p_user, x.label, x.tag, x.source
    from jsonb_to_recordset(p_dislikes) as x(label text, tag text, source text)
  on conflict (user_id, label) do update set tag = excluded.tag, source = excluded.source;

  return jsonb_build_object('updated', v_updated);
end;
$$;

revoke all on function import_decide(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function import_decide(uuid, jsonb, jsonb, jsonb) to service_role;
