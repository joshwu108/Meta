-- Workstream 03 (P1): basic 1:1 text messages between accepted connections, polled by the UI
-- (specs/03-matching-and-groups/specs.md §3 P1). Depends on 0300_social.sql.

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index direct_messages_connection_idx on public.direct_messages (connection_id, created_at);

alter table public.direct_messages enable row level security;

-- Only the two people on an accepted connection read or write. The subquery runs under the
-- connections policy, so it only ever sees the caller's own connections. A block declines the
-- connection, which hides the conversation from both sides.
create policy dm_read on public.direct_messages
  for select to authenticated using (
    exists (select 1 from public.connections c where c.id = connection_id and c.status = 'accepted'));
create policy dm_insert on public.direct_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and exists (select 1 from public.connections c where c.id = connection_id and c.status = 'accepted'));
