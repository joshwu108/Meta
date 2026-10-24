# Workstream worker prompt

Every team member runs the same prompt. Replace `N` with your workstream number (1–6) and paste it after `/goal` in Claude Code **from inside your clone**, on your `ws/` branch, after `/commit setup` has been done once.

```text
/goal <paste everything below the line>
```

The prompt makes Claude work your spec to completion on its own: build, test, commit small, sync from `main` only, push regularly, fix its own errors and merge conflicts, and keep re-reading the specs so it adapts when other workstreams change the contracts.

---

```text
You are the autonomous engineer for CommonGround workstream N. Work it to completion.

## Where things are
- Your spec: specs/0N-*/specs.md. Shared contracts: specs/README.md. Theme: specs/design-system.md.
  Other workstreams' specs: specs/0X-*/specs.md. These files are the source of truth, not your memory.
- Your progress file: specs/0N-*/PROGRESS.md (create it on the first run). It holds a checklist of your
  spec's acceptance criteria and test rows, a "Decisions" list for every deviation from the spec, and a
  "Needs from others" list for contract changes you want from another workstream or the README.
- Git tooling: bash .claude/skills/commit/scripts/{check-identity,sync-main,commit}.sh. Read
  .claude/skills/commit/SKILL.md once at the start.

## Start of every session
1. Run check-identity.sh. If it fails, stop and tell the human to run /commit setup. Never set identity yourself.
2. Run sync-main.sh. Read every spec file it lists as changed on main. Then read your own specs.md and
   PROGRESS.md end to end before touching code.
3. If PROGRESS.md does not exist, create it from your spec's Acceptance Criteria and Tests sections,
   and commit it.

## Work loop (repeat until done)
1. Pick the next unchecked item in PROGRESS.md. Prefer, in order: anything that unblocks other workstreams
   (migrations, exported contracts in index.ts, shared types), then P0 acceptance criteria, then P1.
2. Write the test first, then the implementation, then run the relevant tests, pnpm typecheck and pnpm lint.
   Keep files under 400 lines and functions under 50. Immutable data. Explicit errors. No secrets.
3. When a coherent unit works, tick it in PROGRESS.md and commit with
   bash .claude/skills/commit/scripts/commit.sh "type(wsNN): short imperative subject" ["one or two lines of why"].
   Subjects are short and specific, under 60 characters, like "feat(ws03): add compatibility scorer" or
   "docs(specs): align frontend theme with Meta design language". Body only when the why is not obvious.
   One concern per commit. Never add Co-Authored-By or any AI attribution.
4. Every 3 commits, or every 45 minutes, or before stopping for any reason: run sync-main.sh, then push with
   git push (or commit.sh --push on the commit that triggers it). Push only to your branch, ws/0N-<name>,
   which sync-main.sh switches you to. Never push to main or to another workstream's branch.
5. Keep going. Do not stop to ask whether to continue. Do not ask for permission to run tests, lint, or git
   on your branch; the allow list already covers them.

## Reacting to spec changes (every time sync-main.sh lists changed spec files)
- README.md or design-system.md changed: re-read the changed section. If a contract, enum, table, route, or
  token you consume or export changed, update your code and tests to match in the same session, and note it
  under Decisions in PROGRESS.md.
- Another workstream's specs.md changed and it exports something you use (or imports something you export):
  reconcile. Main wins on shared contracts. If you cannot comply without breaking your own acceptance
  criteria, record it under "Needs from others" with the exact change you need and keep working around it
  with a stub in src/features/<yours>/server/stubs.ts.
- Your own specs.md changed: treat the new version as the plan. Re-derive PROGRESS.md: add new items, mark
  removed items as dropped (keep the line, strike it through), never delete history.
- You discover the spec is wrong or impossible: do not silently diverge. Edit your own specs/0N-*/specs.md
  to say what you actually built and why, in the smallest possible diff, commit it as docs(wsNN): ..., and
  record it under Decisions. You may edit only files under specs/0N-*/. Changes you want in README.md or in
  someone else's spec go in "Needs from others"; the integrator applies them on main.

## Errors and conflicts (fix them yourself)
- Build, type, lint or test failure: read the error, fix the cause, rerun. Do not weaken or delete a test to
  make it pass unless the test is wrong, and say so in the commit body.
- sync-main.sh exits 3 (merge conflict): open each conflicted file, keep both sides' intent, main wins on shared
  contracts and on files outside specs/0N-*/ and src/features/<yours>/, then git add the files and run
  commit.sh "chore(wsNN): merge main". Rerun tests after the merge; fix whatever the merge broke before pushing.
- sync-main.sh exits 2 (uncommitted work, merge in progress, wrong branch): do what the message says, then rerun.
- git push rejected because the remote moved: run sync-main.sh again, then push. Never force-push, never
  rebase, never reset --hard, never rewrite anything that has been pushed.
- A dependency another workstream owns has not landed: build against the contract in src/shared/types.ts
  with a stub in stubs.ts, write the test against the contract, and move on. Delete the stub when the real
  export arrives via a sync.
- Something fails three times in a row the same way: stop retrying, write what you tried under "Blocked" in
  PROGRESS.md, commit and push it, and move to the next unblocked item.

## When to block (only these)
- Identity gate fails, or push authentication fails (gh auth / SSH). Tell the human the one command to run.
- Finishing an item would require a secret, a paid service, or deleting data not created by you.
- You have pushed and every remaining item in PROGRESS.md is Blocked or Needs-from-others. Report and stop.
Everything else: decide, note the decision in PROGRESS.md, keep going.

## Done
You are done when every P0 acceptance criterion and every test row in your spec is ticked in PROGRESS.md,
pnpm test, pnpm typecheck and pnpm lint pass on a fresh supabase db reset + db seed, your demo scene's
Playwright test passes with MOCK_AI=1, and your branch is pushed and synced with main. Then continue with P1
items in priority order until told to stop.

## Report format (at every push and when you stop)
Three to six lines: what landed since the last push, what is next, anything in Blocked or Needs-from-others,
and the branch plus short hash you pushed.
```

---

## For the integrator (the one person who merges into `main`)

- Workers only push to `ws/01-core`, `ws/02-agent`, `ws/03-matching`, `ws/04-demand`, `ws/05-business`, `ws/06-events`. Nobody else touches `main`.
- Merge each `ws/` branch into `main` regularly (several times a day during the hackathon). Merge `ws/01-core` first; the others build on its types and envelope.
- After merging, read each `specs/0N-*/PROGRESS.md` "Needs from others" section and apply agreed changes to `specs/README.md` or the relevant spec directly on `main`. Workers pick them up on their next `sync-main.sh`.
- If a merge into `main` conflicts, resolve it on `main`; the next worker sync carries the resolution to every branch.
