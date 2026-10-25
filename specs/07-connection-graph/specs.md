# Workstream 07 — Connection Graph

> Status: **phases 1–3 shipped** (provenance log and write hooks, snapshot and API, the drawn graph); phases 4–5 planned. Owns
> `supabase/migrations/0700–0799`, `src/features/graph/`, `/graph`, `/api/graph*`. Consumes
> contracts from 01, 02, 03, 06 — adds no new cross-workstream contract of its own except
> `recordGraphEvent()`. Progress in [PROGRESS.md](./PROGRESS.md).

## 1. Purpose

Give a member one screen that answers: **who am I connected to, how did that happen, and what is
forming right now?** Today the social graph exists only as rows (`connections`, `group_members`,
`rsvps`) and as prose in the agent log. The graph view makes the agent's work legible: when the
personal agent scores a match, when a request goes out, when someone accepts, when a group or an
event puts two people in the same room, the user watches an edge appear.

Framing for the demo: the agent is a visible actor in the graph, not a hidden service.

## 2. Scope

### In scope (P0)
1. Ego-centric graph: the viewer at the centre, first-degree people, their groups and shared events.
2. Edge **provenance** — every edge knows why it exists (`agent_suggested`, `request_sent`,
   `accepted`, `group_joined`, `co_attended`, `message_exchanged`).
3. Edge **state** — `connected` (accepted), `forming` (pending request, pending invitation,
   agent suggestion not yet acted on), `faded` (declined / left, hidden by default).
4. Live updates: new nodes and edges animate in while the page is open, within ~15s of the write.
5. Node detail: how you are connected, the agent's one-line "why", shared groups/events, and the
   same actions `/match` offers (connect, message, view, block/report).
6. A semantically equivalent **list view** (same data, keyboard- and screen-reader-first).

### P1
- Second-degree ring (friends-of-friends) under the privacy rules in §5.
- Agent activity ticker: the last N `agent_action_log` rows for this user, rendered as pulses on the
  edges they touched.
- Group-centric view (`/groups/:id` → "graph of this group").

### Out of scope
- Any business-side graph. Invariant 1 of `specs/README.md` (businesses never read `profiles`)
  makes a business-facing social graph a non-feature; business insights stay aggregate counts.
- Global / platform-wide graph. Every query is scoped to the viewer's ego network.
- Writing new relationship state. This workstream **reads** the graph and **logs provenance**; it
  never creates a connection, invitation or RSVP itself.

## 3. Data Model (`supabase/migrations/0700_graph_edge_events.sql`)

Nodes and edges are **derived** from tables that already exist; the only new table is the
provenance log, because no existing table can answer "the agent introduced you".

```
graph_edge_events                      -- append-only, one row per graph-relevant moment
  id           uuid pk
  actor_id     uuid not null references profiles(id) on delete cascade
  subject_id   uuid not null references profiles(id) on delete cascade
  pair_lo      uuid generated always as (least(actor_id, subject_id)) stored
  pair_hi      uuid generated always as (greatest(actor_id, subject_id)) stored
  kind         text not null  check (kind in ('agent_suggested','request_sent','accepted',
                                              'declined','group_joined','co_attended',
                                              'message_exchanged','left'))
  source       text not null  check (source in ('agent','user','group','event'))
  ref_table    text           -- 'connections' | 'groups' | 'events' | null
  ref_id       uuid           -- the row that caused it
  weight       numeric(4,3) not null default 0.1 check (weight between 0 and 1)
  metadata     jsonb not null default '{}'
  created_at   timestamptz not null default now()
  constraint graph_edge_events_distinct check (actor_id <> subject_id)

indexes: (actor_id, created_at desc), (subject_id, created_at desc),
         (pair_lo, pair_hi, created_at desc), (kind, ref_id) where ref_id is not null
```

The stored `pair_lo`/`pair_hi` pair makes a pair read the same whichever side acted, which is what
both the RLS policy and the dedupe read need.

**Repeats.** A moment is recorded once, under one of two policies. Kinds that happen once per row
they point at (`request_sent`, `accepted`, `declined`, `group_joined`, `co_attended`, `left`) are
deduped on the pair plus `ref_id`, so either side may report them. Kinds that recur forever
(`agent_suggested`, `message_exchanged`) are deduped **per direction** per 24h: a re-run of the
matcher is not a second introduction, but the other person replying is their own moment.

RLS: `select` to `authenticated` using `auth.uid() in (actor_id, subject_id) and not
public.is_blocked_with(case when actor_id = auth.uid() then subject_id else actor_id end)`.
No insert/update/delete policy — writes are service-role only, via `recordGraphEvent()`.

Derived sources (read-only, no schema change):

| Node / edge | Source | Notes |
|---|---|---|
| person, connected | `connections` where `status='accepted'` | either direction |
| person, forming | `connections` where `status='pending'` | direction drives the arrow |
| person, suggested | `getMatchesForViewer()` (ws03) | already consent- and block-filtered |
| group node + membership edge | `group_members` where `status='active'` | `can_read_group()` respected |
| group, forming | `invitations` where `status='pending'` | |
| event node + co-attendance edge | `rsvps` where `status='confirmed'` + `events` | past 60 days and upcoming |
| agent pulse | `agent_action_log` where `user_id = viewer` | P1 |

Co-attendance is **only** derived. Writing a provenance row per pair of attendees would be
quadratic in the guest list and would say nothing the `rsvps` rows do not already say with their
own timestamps, so `co_attended` stays in the enum for the backfill and the timeline wording while
no write hook emits it.

**Backfill** — `public.graph_backfill()`, a callable, idempotent function the migration runs once
and `pnpm db:seed` runs again (the seed inserts its rows *after* migrations, so a one-shot
statement would leave the demo data with no story). It synthesizes `request_sent` and the matching
`accepted`/`declined` from `connections`, `group_joined` for every active member against whoever
brought them in (the inviter when an accepted invitation exists, the group's creator otherwise),
and one `message_exchanged` per side of every conversation that has happened. Every row carries
`metadata.backfilled = true`, so the UI can word it as history rather than as something the agent
did. Execute is revoked from `anon` and `authenticated`.

## 4. Snapshot Assembly (`src/features/graph/server/`)

One function, cached like matches:

```ts
getGraphSnapshot(viewerId: string, opts: {
  depth: 1 | 2;
  include: ReadonlyArray<'people' | 'groups' | 'events' | 'suggestions'>;
}): Promise<GraphSnapshot>

type GraphSnapshot = {
  generatedAt: string;
  nodes: ReadonlyArray<GraphNode>;   // { id, kind, label, avatarUrl, degree, meta }
  edges: ReadonlyArray<GraphEdge>;   // { id, a, b, state, provenance, strength, why }
  stats: { connected: number; forming: number; groups: number; events: number; hidden: number };
  truncated: boolean;
};
```

Assembled in TypeScript with the admin client, matching the existing `matching/server/social-graph.ts`
style (not a Postgres function): easier to unit-test under pglite, and it can reuse `getBlockedIds`,
`getPublicCards`, `canReadGroup` and the matches pipeline instead of re-implementing them in SQL.

Rules:
- **Hard caps**: 150 nodes, 400 edges, second-degree fan-out capped at 20 per first-degree node.
  Over the cap → drop lowest-strength first, set `truncated: true`, surface "showing your 150
  closest" in the UI. Never silently truncate.
- **Edge strength** = decayed sum of `graph_edge_events.weight` for the pair
  (`weight * exp(-age_days / 45)`), clamped to `[0.05, 1]`. Drives line thickness and layout
  distance only — never shown as a number, never described as a score.
- **Immutability**: pure functions over fetched rows; `assemble(rows) → snapshot`, no mutation of
  inputs. Every file under 200 lines.
- **Cache**: 60s per viewer in the existing in-process cache, invalidated by `recordGraphEvent()`
  for both sides of the pair (mirrors `invalidateMatches`).

## 5. Privacy Rules (binding)

1. Blocked either way → the person is removed **before** any counting. They never appear, and they
   never appear as part of a "+N more" count.
2. Second-degree nodes are named/avatared only when the first-degree link is `accepted` **and** the
   second-degree profile `is_discoverable`. Everyone else collapses into one anonymous halo node per
   first-degree neighbour ("+3 more"), with no names, ids or avatars in the payload.
3. Suggested nodes come only from the ws03 matches pipeline, which already requires
   `agent_profiles.allow_matching`. No consent → no suggestion ring, and the UI says so plainly.
4. Edge "why" text is `explainRecommendation()` output or a fixed label from `labels.ts`. No raw
   preference, availability or location data crosses into the payload.
5. Location is never a graph dimension (no map layout) — `coarse_location` stays a chip in the
   detail sheet at most.
6. `/api/graph` is `withAuth`, and every query inside it is keyed on the caller, so a session only
   ever reaches its own ego network. It is deliberately *not* `FORBIDDEN` for a business owner:
   one auth user may hold both a consumer profile and a business (README §1), and their own graph
   is their own. What stays impossible is a business *reading someone else's* — the snapshot has
   no parameter for whose graph to draw.

## 6. API

| Route | Returns |
|---|---|
| `GET /api/graph?suggestions=0\|1` | `GraphSnapshot` (`suggestions=0` leaves out the agent's ring) |
| `GET /api/graph/events?since=<iso>` | `{ events: GraphEdgeEvent[], now: string }` — delta feed, max 100, `since` capped at 24h |
| `GET /api/graph/node/:id` | `{ node, paths, sharedGroups, sharedEvents, why, actions }` |

All `withAuth`, all in the standard envelope, all Zod-validated query params
(`src/features/graph/schemas.ts`). `GET /api/graph` is rate-limited per viewer (snapshot is the
expensive one); the delta feed is cheap and indexed.

## 7. Live Updates

Phase 1 — **polling**, the pattern already in `ChatSheet.tsx`: `useGraphLive()` polls
`/api/graph/events?since=<lastSeen>` every 15s, only while `document.visibilityState === 'visible'`,
merges each delta into state immutably, and animates the new node/edge in. Backs off to 60s after
three empty polls, resets on focus.

Phase 2 (optional) — Supabase Realtime on `graph_edge_events` filtered to the viewer. Same reducer,
different transport; the hook's interface does not change. Not needed for the demo.

## 8. Rendering

- **Layout**: concentric rings, not a force simulation, and no layout dependency at all
  (`src/features/graph/layout.ts`). An ego network already has a shape — you in the middle, your
  ties around you, context further out — so rings express it directly, and being pure and
  deterministic they are unit-testable, free of jitter between renders, cheap on a phone, and
  correct under `prefers-reduced-motion` with no special case. Rings from the inside out: ties,
  then groups and events, then what is forming. A ring is phased out of line with the ring inside
  it, children fan around whatever put them on screen, an overflowing ring spills into concentric
  bands, and a final relaxation pass rotates apart any pair whose boxes still collide.
- **What a ring holds** is set by the *name* under a node, which is far wider than the circle:
  9 ties, 12 groups and events, 14 outer. Past that the drawing stops being readable however it is
  arranged, so the canvas draws the closest of each and says so; the List view holds every node.
- **Why not** `d3-force`, `react-force-graph` or `cytoscape`: a simulation jitters between renders,
  needs seeding to be testable, and on a phone resolves a small ego network into a hairball. The
  heavier two are canvas-based, awkward to theme from `tokens.css` and to make accessible.
- **Visual language** (all colours from `src/styles/tokens.css`, light + dark):
  - viewer: centre, `--color-brand` fill, larger radius.
  - connected person: `--color-brand`, solid edge, thickness from strength.
  - forming: dashed edge + slow pulse, `--color-text-3`.
  - agent-originated node or edge: `--gradient-ai` ring (reuse `AiRing` semantics in SVG) and an
    `AiTag` in the detail sheet. The gradient stays reserved for AI output, per the design system.
  - group: rounded square. event: calendar glyph. anonymous halo: unfilled dashed circle.
- **Mobile first** (carrying the ws05 lesson): under 640px the canvas keeps its size and its
  container scrolls — starting centred — rather than shrinking nodes with the viewport; the hit
  area is widened in viewBox units to stay near 44 CSS px wherever the canvas is drawn; detail
  opens in the existing `Sheet`. The nav item is in the rail *and* the mobile tab bar, which now
  carries six items and still fits 320px.
- **Accessibility**: `Graph | List` tabs; the list view is the same `GraphSnapshot` rendered as
  grouped, focusable rows — not a degraded fallback. `prefers-reduced-motion` → static layout, no
  pulse, no entry animation. The SVG carries `role="img"` plus a text summary from `stats`.

## 9. Placement

New route `src/app/(consumer)/graph/page.tsx`, added to `CONSUMER_NAV` with a `Share2` icon but
**not** `inTabBar` — the mobile tab bar is already at its five-slot budget. Entry points: a "View
your graph" action in the `/match` header and a card in `/activity`.

## 10. Files

```
supabase/migrations/0700_graph_edge_events.sql
src/features/graph/
  server/{snapshot.ts,nodes.ts,edges.ts,strength.ts,provenance.ts,cache.ts,types.ts}
  components/{GraphScreen,GraphCanvas,GraphNodeShape,GraphEdgeLine,GraphLegend,
              NodeDetailSheet,GraphListView,GraphFilters}.tsx
  hooks/{useGraphLayout.ts,useGraphLive.ts}
  {schemas.ts,labels.ts,index.ts}
src/app/(consumer)/graph/page.tsx
src/app/api/graph/{route.ts,events/route.ts,node/[id]/route.ts}
```

Touched existing files — each gains one fire-and-forget `recordGraphEvent()` call, in the shape of
`notifySafely` (never throws into the caller's path):

| File | Event |
|---|---|
| `matching/server/connections.ts` | `request_sent`, `accepted`, `declined` |
| `matching/server/matches.ts` | `agent_suggested` (source `agent`) |
| `matching/server/messages.ts` | `message_exchanged` (first message each side sends per day) |
| `groups/server/invitations.ts` | `group_joined`, against the person who invited you |
| `core` nav | `/graph` item (phase 2) |

`supabase/seed/loaders/graph.ts` registers the backfill as a seed loader, so the demo dataset has
provenance for its connections and groups.

## 11. Phases

1. **Provenance** — migration + backfill, `recordGraphEvent()`, the write hooks. Nothing visible
   yet; integration tests prove RLS and that no write path can be broken by a logging failure.
   *(Shipped.)*
2. **Snapshot + list** — `getGraphSnapshot()`, `GET /api/graph`, `/graph` shipping the list view
   only. Fully useful and fully accessible before any pixels move.
3. **Canvas** — ring layout, SVG render, node detail sheet, legend, mobile and desktop.
   *(Shipped.)*
4. **Live** — delta feed, `useGraphLive()`, forming-edge animation.
5. **P1** — second-degree ring, agent activity pulses, group graph.

TDD per workstream rules: tests first in every phase.

## 12. Tests

- **Unit**: `assemble()` excludes blocks before counting; second-degree anonymization; cap and
  `truncated`; strength decay; provenance → label mapping; layout determinism under a fixed seed;
  reducer merges deltas without mutating prior state.
- **Integration** (local Supabase): a second user cannot `select` another's `graph_edge_events`;
  snapshot honours `is_discoverable` and `allow_matching`; a business-owner session gets `FORBIDDEN`
  from `/api/graph`; a failing `recordGraphEvent` does not fail `POST /api/connections`.
- **E2E**: `/graph` renders for `maya@commonground.test`; tapping a node opens the sheet;
  `Graph | List` toggle; 390px and 1280px viewports; light and dark screenshots.
- Coverage ≥80% on `src/features/graph/`.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Second-degree inference leaks who someone knows | §5.2 anonymous halo; no counts across blocks; depth 2 is P1 and can ship off |
| Strength reads as a "friendship score" | never rendered as a number or ranked list; thickness only |
| Dense graph tanks a phone | 150/400 caps, simulation stop condition, freeze when hidden, reduced-motion static path |
| Backfill misstates history | provenance rows from backfill carry `source='user'` and `metadata.backfilled = true`; the UI words them as "connected" with no agent claim |
| A logging failure breaks a connection request | `recordGraphEvent` mirrors `notifySafely` — catches, logs, returns |
