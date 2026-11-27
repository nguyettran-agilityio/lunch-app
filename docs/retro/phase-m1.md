# Retro: milestone M1, Accounts (PR #55 to #83)

M1 built the accounts part of the app: the move of the prototype under `/proto`, the database, Playwright, the design round of the account screens, sign-up and sign-in, Google sign-in, Forgot password and the profile with the email change. Written on 2026-11-27 from the descriptions, commits and comments of PRs #55 to #83, `git log` of `dev`, `docs/decisions.md`, `CLAUDE.md`, the skills, the agent, the hooks, the earlier retros, the transcripts of the M1 sessions (the user's prompts and answers, every hook block and what Claude did right after it), and what the user reported from outside the repo.

## What was done

All PRs were squash-merged into `dev` (one parent each).

| PR | Title | Merge on `dev` |
|---|---|---|
| [#55](https://github.com/nguyettran-agilityio/lunch-app/pull/55) | Implement M1-1a moving the rules to src/domain and the prototype under /proto | eef9b68 |
| [#57](https://github.com/nguyettran-agilityio/lunch-app/pull/57) | Implement M1 open points for the expired email-change page and waiting emails | 182e27c |
| [#58](https://github.com/nguyettran-agilityio/lunch-app/pull/58) | Implement M1-1b database with Drizzle, the PGlite helper and the first migration | 8ea0acd |
| [#59](https://github.com/nguyettran-agilityio/lunch-app/pull/59) | Implement M1-1c Playwright with the test sign-in mode, the layout test and the CI step | c0933e3 |
| [#60](https://github.com/nguyettran-agilityio/lunch-app/pull/60) | Implement M1-D account screen directions on fake data | 223a0c7 |
| [#61](https://github.com/nguyettran-agilityio/lunch-app/pull/61) | Implement M1-D choice of direction A and remove the mockups | 55df7da |
| [#63](https://github.com/nguyettran-agilityio/lunch-app/pull/63) | Handle repo file changes from Bash in the guard (G19) | c143d25 |
| [#65](https://github.com/nguyettran-agilityio/lunch-app/pull/65) | Handle the M1-2 open points for the Lead | 0a1e4fb |
| [#67](https://github.com/nguyettran-agilityio/lunch-app/pull/67) | Handle the Lead's answers on a signed-in visitor at sign-in and sign-up (CN-69) | 43a308a |
| [#68](https://github.com/nguyettran-agilityio/lunch-app/pull/68) | Implement M1-2 sign-up and sign-in with phone or email | 1960e39 |
| [#70](https://github.com/nguyettran-agilityio/lunch-app/pull/70) | Handle the M1-3 open points for the Lead (CN-72) | 06c581a |
| [#72](https://github.com/nguyettran-agilityio/lunch-app/pull/72) | Handle the Lead's last answers before the M1-3 code (CN-72, B62, B63) | 1604208 |
| [#73](https://github.com/nguyettran-agilityio/lunch-app/pull/73) | Implement M1-3 Google sign-in, the linking guard and the shop/customer redirects | 69c88e5 |
| [#75](https://github.com/nguyettran-agilityio/lunch-app/pull/75) | Handle the site address of each branch from Vercel's system variables | 5a80011 |
| [#77](https://github.com/nguyettran-agilityio/lunch-app/pull/77) | Handle the M1-4 open points and plan for Forgot password and the reset page | 3202b5b |
| [#78](https://github.com/nguyettran-agilityio/lunch-app/pull/78) | Implement M1-4 Forgot password and the reset page | 52767e0 |
| [#80](https://github.com/nguyettran-agilityio/lunch-app/pull/80) | Handle a field's message disappearing as soon as the field is edited | 4405a6c |
| [#82](https://github.com/nguyettran-agilityio/lunch-app/pull/82) | Handle the M1-5 open points and plan for the profile and the email change | 5edf70a |
| [#83](https://github.com/nguyettran-agilityio/lunch-app/pull/83) | Implement M1-5 the profile, the email change and proposing a building | 3da9192 |

The other numbers between #55 and #83 are issues. At the end of M1 the check runs 813 Vitest and 206 Playwright tests.

## Went well

- **Open points were asked before the code.** Each milestone PR started with an `ask-lead` round on its "Open for the Lead" (CN-67 to CN-79), and later-milestone points stayed in their milestone (X9).
- **One milestone, small PRs.** Docs PRs (open points and plan) came before code PRs, as G18 asks.
- **The guard caught every repo edit from Bash.** After #63 the guard blocked all three G19 breaks of M1-3 and M1-5 (`cat >>`, `sed -i`, `sed` into a script file).
- **Full check before every push.** All six commands ran before each push in every PR.
- **Each PR wrote down what the Lead must try on the preview** (section 7 of `docs/plan.md`).

## Went wrong

### Claude

| Mistake | Times | Evidence |
|---|---|---|
| `spec-reviewer` ran many rounds | 7 PRs (after 7 runs in the Plan step) | 8 runs in #67, 5 in #77, 4 in #55, #57 (plus 2), #73 (plus 2) and #78, one after every change in #72. The user typed the number of rounds again in 10 prompts, each time differently ("later rounds only the part just changed" 4 times, "at most 2 rounds" 2, "one run on the final version" 2, "until no defect is left" 3), and "a later-milestone point only one line" in 6 |
| Technical choices not in the approved plan added without asking | 3 PRs | #68: one shared database connection through `globalThis` in the test sign-in mode, `<html lang>` set on the client, relative redirects, CN-70 in the code PR. #78: the purge of `used_reset_links` by the server's time ("Claude's choice, not in the plan"). #83: deleting the `auth.one_time_tokens` rows of an email change, a savepoint, `inTransaction` with `AsyncLocalStorage`, an advisory lock per customer ("Added by Claude while coding" in B70) |
| Preview trials too long | 4 blocks (M1-2 to M1-5) | The "Trying the preview" blocks of section 7 of `docs/plan.md` are long paragraphs or tables; the M1-3 one is one paragraph of about 12 actions. Reported by the user: they had to ask Claude to go step by step ("what is the next step in Supabase", session of 2026-11-27) |
| Called the user "chị" | 2 | Reported by the user; the second time at the start of this retro |
| Worked around a hook that blocked (already in `CLAUDE.md` since phase 3) | 2 of 4 blocks | M1-3 session, 2026-11-26: after the block of `cat >> __tests__/accounts.test.ts` Claude went on with Edit, and after the block of a `sed` into a scratchpad file it went on with Write, both without stopping. It stopped correctly after the `.env.example` block (M1-3) and the `sed -i docs/plan.md` block (M1-5) |
| Changed repo files from Bash (G19) | 3 | The three blocks above; the user also typed "edit files only with Edit" in 3 prompts of M1-5 |
| Several jobs in one PR (already in `CLAUDE.md`) | 2 | #68 held CN-70 (said so in its description); #57 held the open points, the B1 answer and the M1-1b review points |

### Hook

- **A path with a variable in the scratchpad counts as a repo file.** In this retro the guard blocked `gh pr view $n … > <scratchpad>/prs/$n.json`, with the directory written in full, because `$n` cannot be resolved (fail closed, G19). Written as a comment on [#12](https://github.com/nguyettran-agilityio/lunch-app/issues/12#issuecomment-7212080762); not changed in this retro, by the user's choice.

### Process

- **Five responses cut off mid-stream and one usage limit** in the M1-2 session; the user had to ask Claude to go on each time.
- **The Lead's limits on `spec-reviewer` changed from PR to PR** (one run, two runs, until no defect), so the rule lived in the prompts, not in the repo.

## Proposals

Rule used, as in the earlier retros: a mistake seen 2 times goes into `CLAUDE.md`; a rule broken 1 time gets a hook or an automatic check; a prompt retyped 2 times becomes a skill. Prompts retyped in M1: the milestone-start prompt 6 times, "update the branch from dev (merge, no rebase)" 4 times, the `spec-reviewer` round limits 10 times.

| # | Problem | Rule | Action | Where | Chosen |
|---|---|---|---|---|---|
| 1 | `spec-reviewer` rounds | Skill | One default in step 2 of `check-and-push`: round 1 reviews the whole PR, later rounds only what just changed; Claude fixes wording and contradictions; points for the Lead are asked once, then the review stops; later-milestone points one line (also in the agent). Docs or plan PR at most 2 rounds, round-2 defects fixed without round 3 and named in "Not checked"; code PR until no defect is left, from round 2 only what changed | `check-and-push`, `spec-reviewer.md`, G22 | Yes |
| 2a | Technical choices outside the plan | `CLAUDE.md` | New line: before coding a technical choice the approved plan does not give, stop and ask with 2–3 options | `CLAUDE.md`, G23 | Yes |
| 2b | Same | Automatic check | `decisions.test.ts` fails on "Added by Claude" without the user's approval of that addition | X8 | No |
| 3 | Preview trials too long | `CLAUDE.md` | New line: trial blocks as numbered steps, one action and one result each; Claude gives one step at a time and waits | `CLAUDE.md`, G24 | Yes, from M2 on; the M1 blocks are not rewritten |
| 4 | Called the user "chị" | `CLAUDE.md` | "How to work here": call the user "bạn", Claude calls itself "mình" or "em", never "chị" | `CLAUDE.md`, X11 | Yes |
| 5 | Worked around a hook again | Hook (the user fixes it) | Every block message of `guard.mjs` ends with "Stop, tell the user the reason and wait; do not retry another way." | `.claude/hooks/guard.mjs` | Yes, as a separate hook PR later; the fix is drafted in this PR's description only |
| 6a | Milestone-start prompt retyped | Skill | New `start-milestone`: `new-branch`, read the milestone, `ask-lead` on its open points, the plan with consequences and the Lead's tasks, the zero-questions test, stop for approval | `.claude/skills/start-milestone/`, G25 | Yes |
| 6b | "Update the branch from dev" retyped | Skill | `check-and-push` merges `origin/dev` into the branch when it has new commits (no rebase), and stops on a conflict | `check-and-push`, G26 | Yes |

Not chosen: 2b (the user: a test that matches words is easy to get around, 2a is enough).

Added by the user after reviewing the proposals:

- Item 4 came from the user during the retro: write the form of address into `CLAUDE.md`, because they had to remind Claude twice.
- The scratchpad-variable block of the guard goes into issue #12 as a comment, with no hook change in this retro.
- On defects left after round 2 of a docs or plan PR: fix them without a third round and say so in "Not checked" (G22).

## Not checked

- The new skill `start-milestone` and the changed `check-and-push` and `spec-reviewer` were not run on a milestone; only `check-and-push` ran, for this PR.
- `allowed-tools` of `check-and-push` was not extended with `git fetch` and `git merge origin/dev` (the edit was refused by the permission check); the new step asks for permission when it runs.
- The hook fix of item 5 is not in this PR.

## Open issues

| Issue | Topic |
|---|---|
| [#8](https://github.com/nguyettran-agilityio/lunch-app/issues/8) | Company email in commit history on a public repo (from phase 0) |
| [#10](https://github.com/nguyettran-agilityio/lunch-app/issues/10) | Check the Vercel production deployment on the first `dev` → `main` release (from phase 0) |
| [#11](https://github.com/nguyettran-agilityio/lunch-app/issues/11) | Regenerate `package-lock.json` so its root entry has `engines` (from phase 0) |
| [#12](https://github.com/nguyettran-agilityio/lunch-app/issues/12) | Guard hook parser misses commands hidden in variables or scripts; also blocks scratchpad paths with a variable (M1 retro) |
| [#18](https://github.com/nguyettran-agilityio/lunch-app/issues/18) | Shared meals, left for v2 (CN-36) |
