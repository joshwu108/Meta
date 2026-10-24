#!/usr/bin/env bash
# Set the git identity Claude commits under, for THIS clone only.
# Usage: set-identity.sh "Full Name" "github-email" "github-username" [workstream-number 1-6]
#
# Writes repo-local git config (never --global), so every teammate's clone
# carries their own identity and nothing identity-related is committed.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: set-identity.sh "Full Name" "email@example.com" "github-username" [workstream 1-6]

  Full Name        Name shown on commits (e.g. "Ada Lovelace")
  email            An email verified on your GitHub account, or your GitHub
                   noreply address: <id>+<username>@users.noreply.github.com
                   (GitHub -> Settings -> Emails). Commits are credited to the
                   account that owns this email.
  github-username  Your GitHub login (used for branch naming and PR mentions)
  workstream       Optional. 1-6 from specs/README.md; sets your default ws/ branch.
USAGE
}

if [[ $# -lt 3 || $# -gt 4 ]]; then usage; exit 1; fi

NAME="$1"; EMAIL="$2"; GH_USER="$3"; WS="${4:-}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: run this from inside the repository" >&2; exit 1
fi
if [[ -z "$NAME" ]]; then echo "error: name is empty" >&2; exit 1; fi
if [[ ! "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  echo "error: '$EMAIL' does not look like an email address" >&2; exit 1
fi
if [[ ! "$GH_USER" =~ ^[A-Za-z0-9](-?[A-Za-z0-9])*$ ]]; then
  echo "error: '$GH_USER' is not a valid GitHub username" >&2; exit 1
fi
if [[ -n "$WS" && ! "$WS" =~ ^[1-6]$ ]]; then
  echo "error: workstream must be 1-6" >&2; exit 1
fi

git config --local user.name "$NAME"
git config --local user.email "$EMAIL"
git config --local commonground.githubUser "$GH_USER"
if [[ -n "$WS" ]]; then
  git config --local commonground.workstream "$WS"
else
  git config --local --unset commonground.workstream 2>/dev/null || true
fi

echo "Identity set for this clone:"
"$(dirname "$0")/check-identity.sh"
