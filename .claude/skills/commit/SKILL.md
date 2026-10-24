---
name: commit
description: Commit (and optionally push) work in the CommonGround repo autonomously, authored by the team member who owns this clone. Use whenever a task is done and should be committed, when the user says "commit", "/commit", "save this", "push this", or when an autonomous task finishes a coherent unit of work. Also handles one-command identity setup with "/commit setup".
---

# /commit — team commit skill

Claude commits on behalf of the human who owns this clone. The commit is authored by
**that person's name and GitHub email**, never by Claude. Identity lives in the repo's
local git config, so each of the six teammates sets it once per clone and nothing
identity-related is ever committed.

Helper scripts (all in `.claude/skills/commit/scripts/`):

| Script | What it does |
|---|---|
| `set-identity.sh "Name" "email" "ghuser" [ws 1-6]` | One-command identity setup for this clone |
| `check-identity.sh` | Prints identity + branch, exits 2 if not configured |
| `commit.sh [--push] [--allow-main] "subject" ["body"]` | Guarded commit that enforces every rule below |
| `sync-main.sh` | Fetch and merge `origin/main` into this clone's `ws/` branch (main only, merge not rebase); lists spec files changed on main; exit 3 on conflict |

## Modes

### `/commit setup <Name> <email> <github-user> [workstream]`

Run `bash .claude/skills/commit/scripts/set-identity.sh "<Name>" "<email>" "<github-user>" <workstream>`
and show the output. If any argument is missing, ask for it. Then:

1. Check push auth: `gh auth status` if `gh` exists, otherwise `ssh -T git@github.com`.
   If neither is authenticated, tell the user exactly one command to run
   (`gh auth login` or set up an SSH key) and stop. Do not try to log in for them.
2. If a workstream was given and the user is on `main`, offer the branch
   `git switch -c ws/0N-<name>` using the names in `check-identity.sh`.

### `/commit` (default)

Commit the current work. Steps, in order:

1. **Identity gate.** Run `bash .claude/skills/commit/scripts/check-identity.sh`.
   If it exits non-zero, stop and tell the user to run `/commit setup ...`. Never
   fall back to global git config, never set `user.name` yourself, never use
   `--author`.
2. **Branch.** If on `main`, switch to the member's workstream branch
   (`ws/0N-...`, create it if needed). Only commit to `main` if the user explicitly
   asked for it in this conversation, and then pass `--allow-main`.
3. **Review the diff.** Run `git status --short` and `git diff` (plus
   `git diff --cached`). Read it. Group changes into one logical commit per
   concern; if the working tree mixes unrelated work, make several commits.
4. **Stage deliberately.** `git add <specific paths>`. Never `git add -A` or
   `git add .` without having read every file that would be included. Never stage
   `.env*` (except `.env.example`), credentials, `node_modules`, build output,
   or `.claude/settings.local.json`.
5. **Write the message.** Conventional Commits, subject ≤ 72 chars:
   `type(scope): imperative description`. Types: feat, fix, refactor, docs, test,
   chore, perf, ci, style, build. Scope is the workstream (`ws01`…`ws06`) or the
   feature folder (`core`, `agent`, `matching`, `groups`, `demand`, `proposals`,
   `business`, `events`, `specs`). Body: 1–5 lines on *why* and anything
   non-obvious. **No AI attribution of any kind**: no `Co-Authored-By: Claude`,
   no "Generated with Claude Code", no robot emoji. The script rejects them.
6. **Commit.** `bash .claude/skills/commit/scripts/commit.sh "subject" "body"`.
   If it blocks, fix the cause (unstage the secret, rename the subject, switch
   branch) and re-run. Never bypass git hooks.
7. **Report.** Show the `committed as <name> <email>` line and the short hash.

### `/commit push`

Same as `/commit`, with `--push` on the final script call. Pushes to `origin`
on the current branch, setting upstream on first push. If the push is rejected
because the remote moved, run `sync-main.sh` (merge from main only, never
rebase) and push again; on exit 3 resolve the listed conflicts, commit the merge, and push.

### `/commit sync`

Run `bash .claude/skills/commit/scripts/sync-main.sh`. It only ever pulls from
`origin/main`, never from another `ws/` branch, and merges rather than rebases so
pushed history is never rewritten. Read every spec file it reports as changed.
On exit 3, resolve the listed conflicts (main wins on shared contracts), `git add`
them, then `commit.sh "chore(ws0N): merge main"`.

### Cadence for autonomous workers (see `specs/WORKER_PROMPT.md`)

Commit after every coherent unit. Sync and push every 3 commits, every 45 minutes,
and before stopping. Push only to this clone's `ws/0N-...` branch.

## Autonomous use

When finishing a task in an autonomous session, you may invoke this skill
without being asked **only if** all are true:

- the task's tests (or at least typecheck/lint) pass, or the user said tests may be skipped;
- the changes are on a `ws/` branch, not `main`;
- the identity gate passes.

Otherwise leave the work uncommitted and say so in the final report.

## Hard rules

- Commits are authored by the human. Claude is a tool, not an author.
- Repo-local identity only (`git config --local`). Never touch `--global`.
- Never force-push, never rewrite history that has been pushed, never `reset --hard`.
- Never commit secrets. The script scans for key patterns but is not exhaustive; read the diff.
- Never bypass git hooks or the quality checks.
- One concern per commit; prefer three small commits over one mixed one.

## Why the email matters

GitHub credits a commit to whichever account has that email verified. Each
member must use an address from GitHub → Settings → Emails, or their noreply
address `<id>+<username>@users.noreply.github.com` if "Keep my email private" is
on. A wrong email produces a grey, unlinked avatar and no contribution credit.
