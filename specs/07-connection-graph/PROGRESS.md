# Workstream 07 — Progress

## Phase 1 — Provenance (done)

The log the graph will read, and the write hooks that fill it. Nothing is visible in the product
yet, which is deliberate: the data has to be trustworthy before anything draws it.

- `supabase/migrations/0700_graph_edge_events.sql` — `graph_edge_events` with stored `pair_lo`/
  `pair_hi`, RLS that lets only the two people a row is about read it and only while neither has
  blocked the other, no write policy at all, and the idempotent `public.graph_backfill()`.
- `src/shared/schemas/graph.ts` — kinds, sources, the row schema and the recorder's input schema.
- `src/features/graph/server/provenance.ts` — `recordGraphEvent` / `recordGraphEvents`: validate,
  default `source`/`weight`/`ref_table` from the kind, drop self edges, collapse repeats (per `ref`
  or per direction per 24h), insert in one statement, and never throw into the caller.
- `src/features/graph/index.ts` — exports the recorder only. The read side will be imported
  directly by this feature's own routes, so 03 and 06 never depend on more than the writer.
- Write hooks: `request_sent` / `accepted` / `declined` in `matching/server/connections.ts`,
  `agent_suggested` in `matching/server/matches.ts`, `message_exchanged` in
  `matching/server/messages.ts`, `group_joined` in `groups/server/invitations.ts`.
- `supabase/seed/loaders/graph.ts` + registry entry, so the demo dataset gets its history.

Verified: 18 unit tests (`tests/unit/graph/`), 15 integration tests
(`tests/integration/graph/`) covering RLS in both directions, a block hiding a pair, refused
writes from a signed-in user, the check constraints, backfill correctness and idempotence, and
every write hook driven through its real route. `src/features/graph/server` is at 98.5% lines /
100% functions. `pnpm test` (901) and `pnpm lint` are green.

### Decisions worth remembering

- **Co-attendance is derived, never written.** A provenance row per pair of attendees is quadratic
  in the guest list and adds nothing to the `rsvps` rows. `co_attended` stays in the enum for the
  backfill and for timeline wording.
- **`group_joined` points at the person who brought you in** — the inviter, or the group's creator
  for seeded and self-joined members. That is the story a graph edge wants to tell.
- **Repeat policy is directional for recurring kinds.** One `message_exchanged` per sender per day,
  not per pair: a reply is its own moment. `ref`-based kinds dedupe on the pair, so either side may
  report an acceptance.
- **Weights are strength contributions, not scores.** They set line thickness and layout distance
  and are never rendered as a number.
- **Backfill is a function, not a migration statement**, because the seed runs after migrations.

## Next — Phase 2 (snapshot + list view)

`getGraphSnapshot()`, `GET /api/graph`, and `/graph` shipping the accessible list view before any
layout work. Privacy rules in specs §5 are the acceptance bar: blocks removed before counting,
second-degree anonymized, consent required for suggestions, no business access.

## Phases 2–3 — The graph people can see (done)

`/graph` is in the consumer nav (rail and mobile tab bar) and draws the viewer's ego network.

- `server/{types,assemble,strength,load,snapshot}.ts` — `getGraphSnapshot()` loads the viewer's own
  slice of 03's and 06's tables plus their provenance and hands it to the pure `assembleGraph`.
  Cached 60s per viewer; `PATCH /api/me` invalidates it so a new picture shows up at once.
- `GET /api/graph?suggestions=0|1`, `src/app/(consumer)/graph/page.tsx`, nav entry.
- `layout.ts` — pure concentric-ring layout, no dependency (see specs §8 for why not a force
  simulation). Rings, phasing, fanning, bands and a relaxation pass; all unit-tested.
- `components/` — `GraphScreen` (Graph | List tabs), `GraphCanvas` (SVG), `GraphNodeShape`,
  `GraphLegend`, `GraphList`, `NodeDetailSheet`.
- `.graph-pulse` in `global.css`, already covered by the file's reduced-motion block.

Verified: 55 unit tests, 22 integration tests, 7 e2e tests. `pnpm test` (961), `pnpm lint` and
`pnpm typecheck` green; `shell.spec.ts` updated for the sixth tab-bar item.

### Decisions worth remembering

- **A node is a circle with a face in it.** The profile picture when there is one, a silhouette
  when there is not, a glyph for groups and events, and the name underneath — so a node is
  recognisable before it is read. Proven end-to-end: the e2e test sets a picture through
  `PATCH /api/me` and asserts the `<image>` appears in the node.
- **Names decide the layout, not circles.** A name is ~84 units wide against a ~40-unit circle, so
  ring capacity, band spacing and the relaxation pass are all sized by the label box. Finding this
  cost several rounds of constant-tuning that the overlap test caught each time; the test is the
  reason the drawing is clean.
- **Rings are capped per ring** (9 ties, 12 groups and events, 14 outer) rather than globally, so a
  long connection list cannot crowd out the groups and suggestions behind it. The legend says what
  was left out and the List view has everyone.
- **The phone scrolls the canvas instead of shrinking it**, starting centred. Shrinking to fit
  390px put nodes below a readable and tappable size.
- **Visiting `/graph` records what the agent found** — the snapshot asks 03's matcher, which writes
  `agent_suggested` provenance. Opening the graph is itself part of the story it tells.

## Next — Phase 4 (live)

`GET /api/graph/events?since=`, `useGraphLive()` polling at 15s while the tab is visible, and the
entry animation for an edge that forms while you are watching.
