#!/usr/bin/env bash
# Guarded commit. Claude stages files and writes the message; this script
# enforces the team rules so an autonomous commit can never go out wrong.
#
# Usage: commit.sh [--push] [--allow-main] "subject line" ["body text"]
#
# Guards:
#   * repo-local identity must be set (set-identity.sh)
#   * refuses to commit on main/master unless --allow-main
#   * refuses if nothing is staged
#   * refuses staged .env* files, private keys, or obvious API tokens
#   * refuses AI attribution trailers (commits are authored by the human)
#   * subject must be Conventional Commits: type(scope): description, <= 72 chars
set -euo pipefail

PUSH=0; ALLOW_MAIN=0
while [[ $# -gt 0 && "$1" == --* ]]; do
  case "$1" in
    --push) PUSH=1 ;;
    --allow-main) ALLOW_MAIN=1 ;;
    *) echo "error: unknown flag $1" >&2; exit 1 ;;
  esac
  shift
done
if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo 'Usage: commit.sh [--push] [--allow-main] "subject" ["body"]' >&2; exit 1
fi
SUBJECT="$1"; BODY="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"

fail() { echo "commit blocked: $*" >&2; exit 2; }

# 1. identity
"$HERE/check-identity.sh" >/dev/null || fail "identity not configured for this clone"

# 2. branch
BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo "")"
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]] && [[ $ALLOW_MAIN -eq 0 ]]; then
  fail "on '$BRANCH'. Work on a ws/ branch (git switch -c ws/0N-name) or pass --allow-main deliberately"
fi

# 3. something staged
STAGED="$(git diff --cached --name-only --diff-filter=ACMR)"
[[ -n "$STAGED" ]] || fail "nothing staged. Stage the files for this change first"

# 4. secrets
while IFS= read -r f; do
  base="$(basename "$f")"
  case "$base" in
    .env|.env.*|*.pem|*.key|id_rsa|id_ed25519)
      [[ "$base" == ".env.example" ]] || fail "refusing to commit secret-looking file: $f" ;;
  esac
done <<< "$STAGED"

SECRET_RE='-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|SUPABASE_SERVICE_ROLE_KEY *= *[A-Za-z0-9._-]{20,}|ANTHROPIC_API_KEY *= *[A-Za-z0-9._-]{20,}'
if git diff --cached -U0 | grep -E '^\+' | grep -Ev '^\+\+\+' | grep -Eq -e "$SECRET_RE"; then
  git diff --cached -U0 | grep -E '^\+' | grep -Ev '^\+\+\+' | grep -En -e "$SECRET_RE" | sed 's/^/  /' >&2
  fail "staged diff contains what looks like a credential. Move it to .env and reference it by name"
fi

# 5. message rules
if [[ ! "$SUBJECT" =~ ^(feat|fix|refactor|docs|test|chore|perf|ci|style|build)(\([a-z0-9/_-]+\))?!?:\ .+ ]]; then
  fail "subject must be Conventional Commits, e.g. 'feat(ws03): add compatibility scorer' (got: $SUBJECT)"
fi
[[ ${#SUBJECT} -le 72 ]] || fail "subject is ${#SUBJECT} chars; keep it <= 72"
FULL="$SUBJECT"
[[ -n "$BODY" ]] && FULL="$SUBJECT"$'\n\n'"$BODY"
if printf '%s' "$FULL" | grep -Eiq 'co-authored-by:.*(claude|anthropic|noreply@anthropic)|generated with .*claude|🤖'; then
  fail "message contains an AI attribution line. Commits are authored by the team member only"
fi

# 6. commit (git hooks stay enabled; this script never bypasses them)
if [[ -n "$BODY" ]]; then
  git commit --quiet -m "$SUBJECT" -m "$BODY"
else
  git commit --quiet -m "$SUBJECT"
fi
echo "committed as $(git log -1 --format='%an <%ae>') on $BRANCH:"
git log -1 --format='  %h %s'

# 7. optional push
if [[ $PUSH -eq 1 ]]; then
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    git push
  else
    git push -u origin "$BRANCH"
  fi
fi
