#!/usr/bin/env bash
# Print the identity Claude will commit under and exit non-zero if it is not set.
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not inside a git repository" >&2; exit 1
fi

NAME="$(git config --local user.name || true)"
EMAIL="$(git config --local user.email || true)"
GH_USER="$(git config --local commonground.githubUser || true)"
WS="$(git config --local commonground.workstream || true)"
BRANCH="$(git symbolic-ref --short -q HEAD || echo '(detached)')"
git rev-parse --verify -q HEAD >/dev/null || BRANCH="$BRANCH (no commits yet)"

WS_BRANCH=""
case "$WS" in
  1) WS_BRANCH="ws/01-core" ;;
  2) WS_BRANCH="ws/02-agent" ;;
  3) WS_BRANCH="ws/03-matching" ;;
  4) WS_BRANCH="ws/04-demand" ;;
  5) WS_BRANCH="ws/05-business" ;;
  6) WS_BRANCH="ws/06-events" ;;
esac

printf '  name:        %s\n' "${NAME:-<unset>}"
printf '  email:       %s\n' "${EMAIL:-<unset>}"
printf '  github:      %s\n' "${GH_USER:-<unset>}"
printf '  workstream:  %s\n' "${WS:-<unset>}${WS_BRANCH:+ ($WS_BRANCH)}"
printf '  branch:      %s\n' "$BRANCH"

if [[ -z "$NAME" || -z "$EMAIL" || -z "$GH_USER" ]]; then
  echo
  echo "Identity is NOT configured for this clone. Run:" >&2
  echo '  bash .claude/skills/commit/scripts/set-identity.sh "Full Name" "you@example.com" "github-user" <ws 1-6>' >&2
  exit 2
fi
