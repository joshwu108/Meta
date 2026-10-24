#!/usr/bin/env bash
# Sync the current ws/ branch with origin/main. MAIN ONLY: never pulls from
# other ws/ branches. Merges (never rebases) so pushed history is not rewritten.
#
# Usage: sync-main.sh
# Exit codes: 0 synced · 2 precondition failed (fix and re-run) · 3 merge conflict
#
# Prints the spec files that changed on main since the last sync so the agent
# can re-read them and adjust its plan.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
fail() { echo "sync blocked: $*" >&2; exit 2; }

"$HERE/check-identity.sh" >/dev/null || fail "identity not configured (run /commit setup)"

WS="$(git config --local commonground.workstream || true)"
case "$WS" in
  1) WS_BRANCH="ws/01-core" ;;     2) WS_BRANCH="ws/02-agent" ;;
  3) WS_BRANCH="ws/03-matching" ;; 4) WS_BRANCH="ws/04-demand" ;;
  5) WS_BRANCH="ws/05-business" ;; 6) WS_BRANCH="ws/06-events" ;;
  *) fail "workstream not set; re-run set-identity.sh with your workstream number" ;;
esac

BRANCH="$(git symbolic-ref --short -q HEAD || echo '')"
if [[ "$BRANCH" != "$WS_BRANCH" ]]; then
  if [[ "$BRANCH" == "main" || -z "$BRANCH" ]]; then
    git switch "$WS_BRANCH" 2>/dev/null || git switch -c "$WS_BRANCH"
    echo "switched to $WS_BRANCH"
  else
    fail "on '$BRANCH' but this clone's workstream branch is '$WS_BRANCH'. Switch to it first"
  fi
fi

[[ -e "$(git rev-parse --git-dir)/MERGE_HEAD" ]] && fail "a merge is already in progress. Resolve it, git add the files, then run commit.sh 'chore(ws0$WS): merge main'"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  fail "uncommitted changes. Commit them first (/commit), then sync"
fi

git fetch --quiet origin main
MAIN="$(git rev-parse origin/main)"
LAST="$(git config --local commonground.lastSyncedMain || true)"
if [[ -z "$LAST" ]] || ! git cat-file -e "$LAST^{commit}" 2>/dev/null; then
  LAST="$(git merge-base HEAD origin/main)"
fi

if [[ "$LAST" != "$MAIN" ]]; then
  CHANGED="$(git diff --name-only "$LAST" "$MAIN" -- specs/ || true)"
  if [[ -n "$CHANGED" ]]; then
    echo "SPEC FILES CHANGED ON MAIN since last sync (re-read these before continuing):"
    printf '  %s\n' $CHANGED
  else
    echo "no spec changes on main since last sync"
  fi
  echo "other files changed on main: $(git diff --name-only "$LAST" "$MAIN" -- . ':!specs' | wc -l | tr -d ' ')"
else
  echo "already up to date with origin/main"
fi
git config --local commonground.lastSyncedMain "$MAIN"

if git merge --quiet --no-edit origin/main; then
  echo "merged origin/main into $WS_BRANCH: $(git log -1 --format=%h)"
else
  echo "MERGE CONFLICT. Files:" >&2
  git diff --name-only --diff-filter=U | sed 's/^/  /' >&2
  echo "Resolve each file (keep both sides' intent, main wins on shared contracts), git add them, then:" >&2
  echo "  bash .claude/skills/commit/scripts/commit.sh \"chore(ws0$WS): merge main\"" >&2
  exit 3
fi

if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  echo "commits not yet pushed: $(git rev-list --count '@{u}..HEAD')"
else
  echo "branch has no upstream yet; next commit.sh --push will set it"
fi
