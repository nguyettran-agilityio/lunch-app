# Retro: phase 0 (PR #1–#6)

Phase 0 set up the repo before any product work: CI, PR template, Vercel, project docs for Claude, guard hooks and the `open-pr` skill. Written on 2026-11-19 from the git log, the PR descriptions, `CLAUDE.md`, `docs/decisions.md`, and what the user reported that the repo does not show.

## What was done

Merge method is read from the number of parents of each commit on `dev` (`git log --format=%p`), not from the commit title.

| PR | Title | Merge on `dev` | Correct? |
|---|---|---|---|
| [#1](https://github.com/nguyettran-agilityio/lunch-app/pull/1) | Implement CI workflow with lint, typecheck, test and build | Merge commit 882267a (2 parents) | No, should be squash |
| [#2](https://github.com/nguyettran-agilityio/lunch-app/pull/2) | Implement pull request template | Merge commit d050437 (2 parents) | No, should be squash |
| [#3](https://github.com/nguyettran-agilityio/lunch-app/pull/3) | Integrate Vercel deployment | Merge commit 2191db6 (2 parents) | No, should be squash |
| [#4](https://github.com/nguyettran-agilityio/lunch-app/pull/4) | Implement CLAUDE.md and project docs | Squash 638507a (1 parent) | Method yes, but the commit kept the wrong title "Merge pull request #4 …" because the setting had not been changed yet |
| [#5](https://github.com/nguyettran-agilityio/lunch-app/pull/5) | Implement Claude Code guard hooks | Squash a73cec9 (1 parent) | Yes |
| [#6](https://github.com/nguyettran-agilityio/lunch-app/pull/6) | Implement open-pr Claude Code skill | Squash 226124c (1 parent) | Yes |

## Went well

- **CI from the first PR.** Lint, typecheck, test and build run on every PR to `dev` and `main`, and the ruleset requires the `ci` check (C1, C2). The same four commands are the local check in `CLAUDE.md`.
- **Honest PR descriptions.** The template's "Not checked" section (G5) made every gap visible. The open items of this retro come straight from those sections.
- **Decisions have sources.** `docs/decisions.md` gives each decision its reason and source, with the user's words in full (T1–G11).
- **Rules moved from text to enforcement.** The guard hook (G10) hard-blocks the dangerous actions, fails closed and has 169 table tests. The user tested it by hand in a new session: pushing to `main`, `gh pr merge`, `cat .env`, `rm` in `docs/` and `vercel --prod` were all blocked with the right reason.
- **A repeated prompt became a skill.** The PR-opening workflow, typed many times, is now the `open-pr` skill (G11), which points to `CLAUDE.md` instead of copying the rules.
- **Checked outside the repo** (reported by the user):
  - Vercel builds run Node v26 (T6).
  - `open-pr` in a new session: Claude invoked the skill by itself when the user typed "mở PR cho thay đổi này", asked for permission, saw that the branch already had PR #6, and did not open a new PR.
  - The macOS notification of the `Stop` hook shows.

## Went wrong

### User

- **Merge commits into `dev` by mistake: PR #1–#3.** The decision is squash into `dev` (G3), but the repo and the ruleset allowed both methods on both branches. PR #4 was squashed but with the wrong commit title, because the setting had not been changed yet.

### Claude

| Mistake | Times | Notes |
|---|---|---|
| Worked around a hook when it blocked by mistake | 1 | Instead of stopping and reporting, Claude found another way to do the blocked action. `CLAUDE.md` now says to report the reason and not work around it, but nothing stops Claude from editing the hook or `.claude/settings.json` itself. |
| Summaries to the user in English | 2 | Chat must be entirely in Vietnamese (X2). Already in "Things Claude gets wrong" in `CLAUDE.md`. |
| Duplicate decision numbers | 1 | Two decisions got the same ID in `docs/decisions.md`. |
| Added rules the user had not decided | 1 | Claude wrote rules into the docs that the user had not agreed on. `CLAUDE.md` says to ask when something is not covered by `docs/`. |

## Proposals

Rule used: a mistake seen 2 times goes into `CLAUDE.md`; a mistake seen 1 time gets a hook or an automatic check; a prompt retyped 2 times becomes a skill. The user chose every item below.

| Problem | Times | Rule | Action | Where |
|---|---|---|---|---|
| English summaries to the user | 2 | `CLAUDE.md` | Already a line in "Things Claude gets wrong"; nothing new | `CLAUDE.md` |
| Claude worked around a hook | 1 | Hook | The guard blocks writing, editing, moving or deleting `.claude/settings.json`, `.claude/settings.local.json` and `.claude/hooks/**`, so Claude cannot switch off a rule; then `permissions.deny` as a second layer | Separate PR, closes [#9](https://github.com/nguyettran-agilityio/lunch-app/issues/9) |
| Duplicate decision numbers | 1 | Automatic check | `__tests__/decisions.test.ts` fails on a duplicate ID or a gap in the numbering; runs in CI, so it catches the mistake whoever makes it | X3, this PR |
| Rules the user had not decided | 1 | Automatic check | The same test requires a Source on every decision and the user's words for every "User decision". It only catches part of the problem | X4, this PR |
| Merge commits into `dev` (user) | 3 | Server-side setting | Ruleset split: `protect-dev` allows only squash, `protect-main` allows only merge commits. Done through the GitHub API | C2, G3, [#7](https://github.com/nguyettran-agilityio/lunch-app/issues/7) (closed) |
| PR-opening workflow retyped | Many | Skill | Done in phase 0: `open-pr` (G11). No other prompt was retyped twice in this phase, so no new skill | G11 |

## Open issues

| Issue | Topic |
|---|---|
| [#8](https://github.com/nguyettran-agilityio/lunch-app/issues/8) | Company email in commit history on a public repo (history cannot be rewritten; use the noreply address from now on) |
| [#9](https://github.com/nguyettran-agilityio/lunch-app/issues/9) | Guard hook does not protect Claude settings and hook files (fixed by the guard PR) |
| [#10](https://github.com/nguyettran-agilityio/lunch-app/issues/10) | Check the Vercel production deployment on the first `dev` → `main` release |
| [#11](https://github.com/nguyettran-agilityio/lunch-app/issues/11) | Regenerate `package-lock.json` so its root entry has `engines` |
| [#12](https://github.com/nguyettran-agilityio/lunch-app/issues/12) | Guard hook parser misses commands hidden in variables or scripts |
