---
name: check-and-push
description: Run the spec-reviewer agent, the full check from CLAUDE.md and the test scenarios, then commit and push the current feature branch, open its PR with open-pr or update the open PR, and report CI. Use when the user asks to run spec-reviewer, the full check and push, or says "chạy spec-reviewer + đủ check + push".
argument-hint: "[what changed, for the commit message]"
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git branch *) Bash(npm run *) Bash(npm test *) Bash(gh pr view *) Bash(gh pr checks *) Bash(gh pr edit *)
---

# Check and push

The rules live in the **Git** and **Check** sections of `CLAUDE.md` and in `docs/decisions.md`. Follow them as written there; this skill only gives the order of the steps. If a rule here and in `CLAUDE.md` ever disagree, `CLAUDE.md` wins. Calling this skill is the user's request to commit and push this work, and to open a PR for the branch with `open-pr` (or update the open one); it is not a request to merge or approve a PR.

What changed, from the user: $ARGUMENTS

## Steps

1. **Check the branch.** Run `git status` and `git branch --show-current`. On `dev` or `main`, stop and ask the user. Nothing to commit and nothing to push: stop and tell the user.
2. **Run `spec-reviewer`** (the agent in `.claude/agents/spec-reviewer.md`) when the change touches the prototype or the app (`src/proto`, `src/screens`, `src/components`, `src/app`), `docs/spec.md`, `docs/plan.md` or `docs/test-scenarios.md`. Never skip it for a change to the plan: it reviews the plan against the spec. If the agent is not loaded in this session (a new agent loads only in a new session), run a general-purpose agent that follows that file, and say so in the report.
   - **Defects**: fix every one, whatever its severity, so the code does what the spec says, add a test that fails on the old code, then run `spec-reviewer` again. Repeat until no defect is left. A defect you cannot fix: stop and ask the user; do not only list it in the PR (G15).
   - **Not in the spec**: do not decide. Points the next milestone needs (or the current change, before the plan exists): stop and ask the Lead with the `ask-lead` skill, then go back to step 2 once the answers are in the spec and in the code. Points only a later milestone needs: write them under "Open for the Lead" of that milestone in `docs/plan.md`; they are asked when that milestone starts.
   - **Last run**: if any file changed after the last `spec-reviewer` run, run it again before step 4. Commit only after a run on the final files reports no defect.
   - **Untested acceptance criteria**: add the missing tests. A test you cannot write: stop and ask the user (G15).
3. **Update the scenarios.** In `docs/test-scenarios.md`, set "How run" of each scenario run in this change ("Browser", "Test" or "Both"); a scenario still "Planned" goes to "Not checked". Click through the "Browser" ones in the Browser pane at 375px before you set them.
4. **Run the full check** from the **Check** section of `CLAUDE.md`: every command, in that order (five once `npm run test:e2e` exists, see `CLAUDE.md`). If any fails, fix it and run them all again; if you cannot fix it, stop and ask the user. Never push after running only some of them.
5. **Commit** the files of this change only (`git add <paths>`, never `git add -A`), with a message that follows the Git rules in `CLAUDE.md`.
6. **Push**: `git push -u origin HEAD`. If a hook blocks it, tell the user the reason and stop.
7. **Open or update the PR.** If no PR is open for the branch (`gh pr view`), open it with the `open-pr` skill. If one is open, update its description with `gh pr edit <number> --body-file <file>` (file outside the repo) so every section of the template covers this change too, in particular "Changes", "How tested" and "Not checked".
8. **Report** to the user in Vietnamese:
   - the `spec-reviewer` result (defects fixed, open points asked, points written for a later milestone, untested criteria) and the verdict of the last run on the final files,
   - the check result (number of tests),
   - the scenarios run and those still "Planned",
   - the PR link and the CI result (`gh pr checks <number> --watch`, in the background).

Never merge, approve or enable auto-merge. Merging is the user's call, and hooks block it.
