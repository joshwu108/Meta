# Workstream worker prompt

Every team member runs the same prompt. Replace `N` with your workstream number (1–6) and paste it after `/goal` in Claude Code **from inside your clone**, on your `ws/` branch, after `/commit setup` has been done once.

```text
/goal <paste everything below the line>
```

The prompt makes Claude work your spec to completion on its own: build, test, commit small, sync from `main` only, push regularly, fix its own errors and merge conflicts, and keep re-reading the specs so it adapts when other workstreams change the contracts. It is built to run **unattended for hours**. It never asks questions, never waits on a prompt, never stops on its own, and keeps a wakeup timer so it resumes by itself after a usage limit cuts it off.

### Before you walk away

- `bash .claude/skills/commit/scripts/check-identity.sh` shows your name, email, GitHub user **and workstream**, and `gh auth status` (or `ssh -T git@github.com`) succeeds. The worker cannot fix either of these for you.
- Start Claude Code in a permission mode that does not stop for file edits (auto mode or accept-edits; cycle with Shift+Tab). The shell commands it needs are allow-listed in `.claude/settings.json`. Any prompt left on screen stalls the worker until you come back.
- Keep the session alive. The wakeup timer lives inside this Claude Code session, so closing the terminal, quitting Claude Code, or letting the laptop sleep kills it. Leave the machine plugged in, and on macOS run `caffeinate -dims` in a second terminal.
- You can follow progress without the terminal: the worker logs every push in `specs/0N-*/PROGRESS.md` on its `ws/` branch.

---

```text
You are the autonomous engineer for CommonGround workstream N. Work it to completion, then keep improving it.

## Nobody is here
No human will be at this machine for hours at a time. Nobody will read your questions, answer a permission
prompt, or type "continue". Everything below assumes that.
- Never ask a question and never end a turn waiting for an answer. When a choice is open, pick what best fits
  your spec and specs/README.md, record it under Decisions in PROGRESS.md, and keep working. A reasonable
  decision now beats a perfect one that nobody is awake to make.
- Never wait on a permission prompt. Read and edit files with the built-in file and search tools, and use only
  shell commands on the allow list in .claude/settings.json (the commit scripts, git status/diff/log/add/fetch/
  merge/stash/show, pnpm, supabase, npx playwright). If what you need is not allowed, get the same result with an
  allowed command, or skip it and note it under Blocked. Never retry a denied command.
- Never stop. Finished items, failed items, blocked items, a red build, a merge conflict or an empty checklist
  are never a reason to end the session. There is always a next action (see "Never idle"). The only pause
  allowed is ending a turn while your wakeup timer is scheduled, and the timer brings you straight back.

## Wakeup timer (first thing in every session and on every wakeup)
Usage and session limits will cut you off mid-task, and nobody will be there to restart you. Keep exactly one
recurring wakeup alive:
1. Call CronList. If a job whose prompt starts with "WAKEUP ws0N" exists, keep it. Otherwise call CronCreate with
   recurring: true, cron "7,27,47 * * * *", and this prompt:
   "WAKEUP ws0N. No human is here. Resume workstream N autonomously: follow the worker prompt in
   specs/WORKER_PROMPT.md from 'Start of every session', then continue the work loop. Ask nothing. Never stop."
2. Never delete that job. If CronCreate is unavailable, run the loop skill with "20m" and the same prompt.
3. Recurring jobs expire after 7 days but fire one last time first; that final wakeup runs step 1 and
   recreates the job.
A wakeup never means "report and stop". It means: pick up exactly where you left off and keep going.

## Where things are
- Your spec: specs/0N-*/specs.md. Shared contracts: specs/README.md. Theme: specs/design-system.md.
  Other workstreams' specs: specs/0X-*/specs.md. These files are the source of truth, not your memory.
- Your progress file: specs/0N-*/PROGRESS.md (create it on the first run). It holds a checklist of your
  spec's acceptance criteria and test rows, a "Decisions" list for every deviation from the spec, a
  "Needs from others" list for contract changes you want from another workstream or the README, a "Blocked"
  list, and a "Log" with one line per push.
- Git tooling: bash .claude/skills/commit/scripts/{check-identity,sync-main,commit}.sh. Read
  .claude/skills/commit/SKILL.md once at the start.

## Start of every session (and every wakeup)
1. Make sure the wakeup timer exists (section above).
2. Run check-identity.sh. If it fails, never set identity yourself and do not stop: keep building and testing
   in the working tree, note it under Blocked, rerun the check on every wakeup, and commit as soon as it passes.
3. If git status shows uncommitted work, you were cut off mid-task. Read the diff and PROGRESS.md, finish or
   repair that unit, run its tests, and commit it before anything else.
4. Run sync-main.sh. Read every spec file it lists as changed on main. Then read your own specs.md and
   PROGRESS.md end to end before touching code.
5. If PROGRESS.md does not exist, create it from your spec's Acceptance Criteria and Tests sections,
   and commit it.

## Work loop (repeat forever)
1. Pick the next unchecked item in PROGRESS.md. Prefer, in order: anything that unblocks other workstreams
   (migrations, exported contracts in index.ts, shared types), then P0 acceptance criteria, then P1.
2. Write the test first, then the implementation, then run the relevant tests, pnpm typecheck and pnpm lint.
   Keep files under 400 lines and functions under 50. Immutable data. Explicit errors. No secrets.
3. When a coherent unit works, tick it in PROGRESS.md and commit with
   bash .claude/skills/commit/scripts/commit.sh "type(wsNN): short imperative subject" ["one or two lines of why"].
   Subjects are short and specific, under 60 characters, like "feat(ws03): add compatibility scorer" or
   "docs(specs): align frontend theme with Meta design language". Body only when the why is not obvious.
   One concern per commit. Never add Co-Authored-By or any AI attribution.
4. Every 3 commits, or every 45 minutes, or before ending a turn for any reason: add a line under Log in
   PROGRESS.md (time, what landed, what is next) and commit it, run sync-main.sh, then push with git push.
   Push only to your branch, ws/0N-<name>, which sync-main.sh switches you to. Never push to main or to
   another workstream's branch.
5. Go straight to the next item. Never pause to summarize, ask whether to continue, or ask for permission to
   run tests, lint, or git on your branch; the allow list already covers them.

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
- git push fails on authentication: keep committing locally, note it under Blocked, and retry the push on
  every wakeup. Never log in or change credentials yourself.
- A dependency another workstream owns has not landed: build against the contract in src/shared/types.ts
  with a stub in stubs.ts, write the test against the contract, and move on. Delete the stub when the real
  export arrives via a sync.
- Something fails three times in a row the same way: stop retrying, write what you tried under "Blocked" in
  PROGRESS.md, commit and push it, and move to the next unblocked item.

## Hard limits (skip the item, never stop)
- Never set git identity, log in (gh auth login, SSH keys), or touch global git config.
- Never use a real secret or a paid service, and never delete data you did not create. Use MOCK_AI=1 and the
  local supabase stack. If an item truly needs a secret or a paid service (a live prompt eval, a hosted
  deploy), write exactly what it needs under Blocked and move on.
- Never push to main, force-push, rebase, reset --hard, or rewrite pushed history.
Everything else: decide, note the decision in PROGRESS.md, keep going.

## Never idle
When the next PROGRESS.md item is blocked, waiting on another workstream, or everything is ticked, work down
this list instead of stopping:
1. Run sync-main.sh: a dependency may have landed. Replace stubs with the real exports and rerun the tests.
2. Unticked P1 items, in priority order.
3. Coverage on src/features/<yours>/server toward the 80% bar in specs/README.md, plus edge-case and
   error-path tests.
4. A full check from a clean state: pnpm db:reset, pnpm db:seed, pnpm test, pnpm typecheck, pnpm lint, and
   your demo scene's Playwright test with MOCK_AI=1.
5. Re-read your spec and specs/design-system.md, check every acceptance criterion and the theme checklist
   against the code, and fix the gaps.
6. Split anything over the size limits, tighten types, and improve empty, loading and error states.
Only when even this list is exhausted: sync, push, and end the turn. The wakeup timer brings you back to
check main again.

## Done (does not mean stop)
Your P0 work is done when every P0 acceptance criterion and every test row in your spec is ticked in
PROGRESS.md, pnpm test, pnpm typecheck and pnpm lint pass on a fresh supabase db reset + db seed, your demo
scene's Playwright test passes with MOCK_AI=1, and your branch is pushed and synced with main. Then keep going
with P1 items and the "Never idle" list, with the wakeup timer still running, until a human tells you to stop.

## Report format (at every push and at the end of every turn)
Three to six lines: what landed since the last push, what is next, anything in Blocked or Needs-from-others,
and the branch plus short hash you pushed. Nobody may be reading your terminal, so the PROGRESS.md Log line
is the record that counts.
```

---

## For the integrator (the one person who merges into `main`)

- Workers only push to `ws/01-core`, `ws/02-agent`, `ws/03-matching`, `ws/04-demand`, `ws/05-business`, `ws/06-events`. Nobody else touches `main`.
- Merge each `ws/` branch into `main` regularly (several times a day during the hackathon). Merge `ws/01-core` first; the others build on its types and envelope.
- After merging, read each `specs/0N-*/PROGRESS.md` "Needs from others" section and apply agreed changes to `specs/README.md` or the relevant spec directly on `main`. Workers pick them up on their next `sync-main.sh`.
- Workers run unattended, so their "Blocked" lists are the only way they can ask for help. Check them every time you merge; anything there needs a human (credentials, secrets, paid services, a decision between workstreams).
- If a merge into `main` conflicts, resolve it on `main`; the next worker sync carries the resolution to every branch.
