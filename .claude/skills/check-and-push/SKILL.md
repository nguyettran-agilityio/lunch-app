---
name: check-and-push
description: Run the spec-reviewer agent, the full check from CLAUDE.md and the test scenarios, then commit and push the current feature branch and report CI. Use when the user asks to run spec-reviewer, the full check and push.
argument-hint: "[what changed, for the commit message]"
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git branch *) Bash(npm run *) Bash(npm test *) Bash(gh pr view *) Bash(gh pr checks *)
---

# Check and push

The rules live in the **Git** and **Check** sections of `CLAUDE.md` and in `docs/decisions.md`. Follow them as written there; this skill only gives the order of the steps. If a rule here and in `CLAUDE.md` ever disagree, `CLAUDE.md` wins. Calling this skill is the user's request to commit and push this work; it is not a request to open, merge or approve a PR.

What changed, from the user: $ARGUMENTS

## Steps

1. **Check the branch.** Run `git status` and `git branch --show-current`. On `dev` or `main`, stop and ask the user. Nothing to commit and nothing to push: stop and tell the user.
2. **Run `spec-reviewer`** (the agent in `.claude/agents/spec-reviewer.md`) when the change touches the prototype (`src/proto`, `src/screens`, `src/components`, `src/app`) or `docs/spec.md`. If the agent is not loaded in this session (a new agent loads only in a new session), run a general-purpose agent that follows that file, and say so in the report.
   - **Defects**: fix each one so the code does what the spec says, add a test that fails on the old code, then run `spec-reviewer` again. Repeat until no high or medium defect is left; list any low defect you did not fix.
   - **Not in the spec**: do not decide. Stop and ask the Lead with the `ask-lead` skill, then go back to step 2 once the answers are in the spec and in the code.
   - **Untested acceptance criteria**: add the missing tests, or list them for "Not checked".
3. **Update the scenarios.** In `docs/test-scenarios.md`, set "How run" of each scenario run in this change ("Browser", "Test" or "Both"); a scenario still "Planned" goes to "Not checked". Click through the "Browser" ones in the Browser pane at 375px before you set them.
4. **Run the full check** from the **Check** section of `CLAUDE.md`: all four commands, in that order. If any fails, fix it and run all four again. Never push after running only some of them.
5. **Commit** the files of this change only (`git add <paths>`, never `git add -A`), with a message that follows the Git rules in `CLAUDE.md`.
6. **Push**: `git push -u origin HEAD`. If a hook blocks it, tell the user the reason and stop.
7. **Report** to the user in Vietnamese:
   - the `spec-reviewer` result (defects fixed, open points asked, untested criteria),
   - the check result (number of tests),
   - the scenarios run and those still "Planned",
   - if a PR is open for the branch (`gh pr view`), its link and the CI result (`gh pr checks <number> --watch`, in the background); the PR description still needs a "How tested" entry for this change. If no PR is open, say the branch can be opened with `open-pr`.

Never merge, approve or enable auto-merge. Merging is the user's call, and hooks block it.
