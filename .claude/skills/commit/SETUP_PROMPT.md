# Team setup prompt for the `/commit` skill

Each teammate: fill in the four values in the first block, then paste the whole
thing into Claude Code **from inside your clone of the CommonGround repo**.
It takes about a minute and only has to be done once per clone.

Your email must be one verified on your GitHub account (GitHub → Settings →
Emails). If you have "Keep my email private" on, use your noreply address
shown on that page: `<id>+<username>@users.noreply.github.com`.

---

```text
Set up the team commit skill for me in this repository.

My details:
  NAME       = <Full Name as it should appear on commits>
  EMAIL      = <email verified on my GitHub account, or my GitHub noreply address>
  GITHUB     = <my GitHub username>
  WORKSTREAM = <1-6, my workstream number from specs/README.md>

Do the following, in order, and show me the output of each step:

1. Confirm we are at the root of the CommonGround repo (there is a `specs/README.md`
   and a `.git` directory). If not, stop and tell me where to cd.

2. Make sure the skill exists at `.claude/skills/commit/SKILL.md` with the three
   scripts in `.claude/skills/commit/scripts/` (set-identity.sh, check-identity.sh,
   commit.sh). If they are missing, run `git fetch origin && git checkout origin/main -- .claude`
   to pull them from main, then `chmod +x .claude/skills/commit/scripts/*.sh`.

3. Run exactly:
   bash .claude/skills/commit/scripts/set-identity.sh "NAME" "EMAIL" "GITHUB" WORKSTREAM
   using my values above. This writes repo-local git config only (never --global).

4. Run `bash .claude/skills/commit/scripts/check-identity.sh` and confirm all four
   fields show my values.

5. Check that I can push: run `gh auth status` if gh is installed, otherwise
   `ssh -T git@github.com`. If I am not authenticated, tell me the single command
   to run (gh auth login, or how to add an SSH key) and wait. Do not log in for me.

6. Create or switch to my workstream branch using the ws/ name that
   check-identity.sh printed (for example ws/03-matching). Never commit to main.

7. Tell me in two sentences how to use it from now on: `/commit` commits my current
   work under my name, `/commit push` also pushes, and Claude may run it on its own
   when it finishes a task on my ws/ branch with passing tests.

Rules you must follow for this and every future commit in this repo: commits are
authored by me (the identity above), never by Claude; never add Co-Authored-By or
"Generated with Claude Code" lines; never touch global git config; never bypass
git hooks; never commit .env files or credentials.
```

---

After this, verify once with a throwaway change:

```text
/commit
```

The last line of Claude's output should read `committed as <Your Name> <your email>`.
