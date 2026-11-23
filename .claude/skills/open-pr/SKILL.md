---
name: open-pr
description: Open a pull request into dev for the current feature branch, following this repo's Git rules and PR template, then wait for CI and report the link. Use when the user asks to open or create a PR, or says "mở PR".
argument-hint: "[extra context for the PR description]"
allowed-tools: Bash(git status *) Bash(git log *) Bash(git diff *) Bash(git fetch *) Bash(gh pr checks *) Bash(gh pr view *) Bash(gh issue list *)
---

# Open a PR

The rules live in the **Git** and **Check** sections of `CLAUDE.md` and in `docs/decisions.md` (G1–G11). Follow them as written there; this skill only gives the order of the steps. If a rule here and in `CLAUDE.md` ever disagree, `CLAUDE.md` wins.

Extra context from the user: $ARGUMENTS

## Steps

1. **Check the branch.** Run `git status` and `git branch --show-current`.
   - The branch must follow the branch rule in `CLAUDE.md`. On `dev` or `main`, stop and ask the user.
   - Uncommitted changes: stop and ask the user whether to commit them first. Do not commit on your own.
   - `git fetch origin`, then read `git log origin/dev..HEAD` and `git diff origin/dev...HEAD --stat`. No commits ahead of `dev`: stop and tell the user.
   - A PR already open for this branch (`gh pr view`): report its link instead of opening another.
2. **Run the check** from the **Check** section of `CLAUDE.md`. If any step fails, stop and report the output. Do not open the PR.
3. **Push** the branch: `git push -u origin HEAD`. If a hook blocks it, tell the user the reason and stop.
4. **Write the title** following the title and capitalization rules in `CLAUDE.md`.
5. **Find the issue** (G21 in `docs/decisions.md`). If the branch does a PR of `docs/plan.md`, find its issue: `gh issue list --state open --search "<PR id> in:title"` (for example `M1-1a`), and note its milestone. If the PR is not in the plan, create a short issue first, with no milestone: `gh issue create --title "<what the PR does>" --body-file <file>` (Goal, "Done when" and the related docs, in English, file outside the repo). A plan PR whose issue cannot be found: stop and ask the user.
6. **Write the body** from `.github/pull_request_template.md`:
   - Keep every heading, in order. Replace each HTML comment with real content; follow the comment's own instructions (for example "None").
   - Base it on the commits, the diff, the check results from step 2 and the extra context above. Under "Not checked", list honestly what was not verified (CI is still running at this point).
   - Follow the language and attribution rules in `CLAUDE.md`.
   - Under "Related", the first line is `Closes #<issue>` for the issue of step 5.
   - Write it to a temporary file outside the repo.
7. **Open the PR** with `gh pr create --base dev --title "<title>" --body-file <file>`, adding `--milestone "<milestone>"` when the issue has one.
8. **Wait for CI**: `gh pr checks <number> --watch` (in the background). Then report to the user: the PR link, each check's result, and on failure the failing step and log excerpt.

Never merge the PR, enable auto-merge or approve it. Merging is the user's call, and hooks block it.
