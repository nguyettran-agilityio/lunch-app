# Retro: phase 3, Plan (PR #21)

Phase 3 turned the spec and the prototype into `docs/plan.md`: the build decisions B1–B26, milestones M1–M6 with their PRs, and the spec rounds CN-58 to CN-65 found while planning. Written on 2026-11-23 from the description and commits of PR #21, `docs/decisions.md`, `CLAUDE.md`, the skills, the agent, the hooks, the earlier retros, the transcript of the Plan session (prompts, the Lead's rejections of the plan and every hook block), and what the user reported from outside the repo.

## What was done

| PR | Title | Merge on `dev` | Result |
|---|---|---|---|
| [#21](https://github.com/nguyettran-agilityio/lunch-app/pull/21) | Implement build plan with vertical-slice milestones | Squash 9bef72e (1 parent) | `docs/plan.md`; B1–B26; spec CN-58 to CN-65, BR-6a, BR-11b, BR-28a, BR-29a–BR-29c, AC49–AC110; UI15, UI16; scenarios sections 13–18 as "Planned"; three prototype fixes (BR-28a, BR-29b, CN-61) |

PR #21 had two commits: the plan, then the zero-questions test of M1 (N1–N14, A2–A4, B21–B26, CN-64, CN-65).

## Went well

- **The big choices went to the Lead first.** Prototype reuse, data, sign-in and email were asked with a recommendation before the plan was written (B1–B11).
- **Every AC in exactly one milestone.** A cross-check script matched the AC table, each milestone's "Completes" line and the exception list of the coverage test (AC1–AC110).
- **No secret in the repo.** Only variable names, in section 3 of the plan (B10, B22).
- **The zero-questions test worked.** Reading only the repository, Claude found 17 places in M1 where it would still have to ask or guess; all were decided before coding.
- **Rules from earlier phases held.** Chat stayed in Vietnamese, decision ids stayed unique (X3), every check command ran before each push.

## Went wrong

### Claude

| Mistake | Times | Evidence |
|---|---|---|
| The plan was shown without its consequences | 2 rejected plans, 3 points | First rejection: free-plan limits (Resend without a domain, Supabase pausing) not written as the Lead's tasks. Second rejection: removing the store and the demo bar in M1 breaks the screens not yet moved until M5; requiring email confirmation while Resend has no domain means only the Lead's email gets mail (B7, B8, B10) |
| Asked after instead of before, now in the plan | 3 sources | Supabase links a Google identity to an account with the same email (against CN-2/CN-3), found by the Lead, not by Claude; `spec-reviewer` ran seven times and its open points became CN-60 to CN-65; the zero-questions test, asked for by the Lead, still found N1–N14 and A2–A4. "Building behaviour the spec does not cover…" was already in `CLAUDE.md`, for code only |
| Worked around a hook that blocked by mistake | 4 of 5 blocks (+1 in phase 0) | The guard blocked `git check-ignore .env.example` and four `python3` here-document scripts whose text written into the docs or the PR body named the example environment file. Claude stopped after the first one, but after the other four it rewrote the text or moved the edit to the Edit tool and went on, instead of stopping and waiting |
| `check-and-push` was planned without `spec-reviewer` | 1 | The skill ran `spec-reviewer` only for the prototype or `docs/spec.md`, so the first plan skipped it for `docs/plan.md`; the Lead asked for it in the first rejection |
| Technical choices proposed by Claude not marked as such | 1 | First rejection: the Lead asked that they be written in `decisions.md` as proposed by Claude (B12–B20) |
| Last changes not run past `spec-reviewer` | 1 | PR #21 "Not checked": the last edits (CN-65, AC109–AC110, the plan fixes of the second review) were not reviewed a third time |
| Several jobs in one PR | 2 (PR #17, PR #21) | Reported by the user: PR #21 held a spec round, the plan and prototype code |
| Changed approved wording on its own | 1 | Reported by the user: the wording of AC42 ("The demo time reaches 11:00" became "The time (the demo time in the prototype) reaches 11:00") and the transition, compared with the plan the Lead had approved |

### Hook

- **The `.env*` rule blocks text.** In code given to an interpreter (`-c`, `-e`, or a here-document fed to `python3` or `node`) the guard blocks any `.env` name, even inside a string that is only text for a document; and it treats the path argument of `git check-ignore` as a file being read. Five false blocks in one session.

### Process

- **The plan was fixed twice before it was approved** (reported by the user), and after approval the zero-questions test found 17 more points.
- **Every open point was asked at once.** Points only a later milestone needs were asked in the Plan step, which made the `spec-reviewer` rounds longer.

## Proposals

Rule used, as in the earlier retros: a mistake seen 2 times goes into `CLAUDE.md`; a rule broken 1 time gets a hook or an automatic check; a prompt retyped 2 times becomes a skill. Prompts retyped in this and earlier sessions: "Create the branch … from the latest dev" 3 times, "then check-and-push and open (or update) the PR" 4 times, the retro prompt 3 times, the zero-questions test 1 time.

| # | Problem | Rule | Action | Where | Chosen |
|---|---|---|---|---|---|
| 1 | Plan without its consequences | `CLAUDE.md` | New line: before asking the Lead to approve a plan, write for each decision what breaks between milestones and what the Lead has to do outside the repo | `CLAUDE.md` | Yes |
| 2 | Asked after, now in the plan | `CLAUDE.md` | The line "Building behaviour the spec does not cover…" now covers plans too, and Claude runs the zero-questions test itself before showing a plan (the prompt was typed once, so not a skill yet) | `CLAUDE.md` | Yes |
| 3 | Worked around a hook | `CLAUDE.md` | New line: when a hook blocks, even by mistake, stop, tell the reason and wait; do not rewrite the command or the text, do not switch tools | `CLAUDE.md` | Yes |
| 4 | The guard blocks `.env` in text | Hook (the user fixes it) | (a) skip the path arguments of `git check-ignore` and `git check-attr`, which only compare names (keep blocking `git add -f .env`); (b) before looking for `.env` in inline or here-document code, drop the string literals that contain whitespace (text), like `wordNamesEnv`; keep blocking `open('.env')` | `.claude/hooks/guard.mjs` | Yes, as a separate PR after this one: Claude writes the tests and the instructions, the user fixes `guard.mjs` |
| 5 | `check-and-push` skipped `spec-reviewer` for the plan | Hook / check | A hook cannot see whether the agent ran; step 2 of the skill now also covers `docs/plan.md` and `docs/test-scenarios.md` | G12 | Yes |
| 6 | Claude's proposals not marked | Automatic check | `decisions.test.ts` fails if a decision from the Build section on does not start its Why with "User decision" or "Proposed by Claude" | X8 | Yes |
| 7 | Last changes not reviewed | Hook / check | A hook cannot see it; `check-and-push` runs `spec-reviewer` again when a file changed after the last run, and the report gives the verdict of the last run | G12 | Yes |
| 8 | "Create the branch … from the latest dev" retyped | Skill | `new-branch` | G16 | Yes |
| 9 | "check-and-push, then open or update the PR" retyped | Skill | 9a: `check-and-push` opens the PR with `open-pr` when there is none, or updates the open PR's description; 9b: a new `ship` skill calling both | G12 | 9a |
| 10 | Retro prompt retyped | Skill | `retro` | G17 | Yes |

Not chosen: 9b.

Added by the user after reviewing the proposals:

- PR #21 held a spec round, the plan and prototype code, the second time after the Design phase: one PR, one job; when an answer from `ask-lead` leads to changes in another part, open a separate PR (`CLAUDE.md`, G18).
- Changing the wording of an AC or an approved plan also needs asking first: the line "Adding rules the user has not decided…" is extended (`CLAUDE.md`, X10).
- For item 2: `spec-reviewer` and `ask-lead` ask at once only the points the next milestone needs; the points of a later milestone are written under "Open for the Lead" of that milestone in `docs/plan.md` and asked when it starts (X9; each milestone of the plan now has the line, "None" for now).

## Not checked

- The new skills `new-branch` and `retro` were not run; the changed `ask-lead` and `spec-reviewer` were not run either. Only the changed `check-and-push` ran, for this PR.
- The hook fix of item 4 is not in this PR.

## Open issues

| Issue | Topic |
|---|---|
| [#8](https://github.com/nguyettran-agilityio/lunch-app/issues/8) | Company email in commit history on a public repo (from phase 0) |
| [#10](https://github.com/nguyettran-agilityio/lunch-app/issues/10) | Check the Vercel production deployment on the first `dev` → `main` release (from phase 0) |
| [#11](https://github.com/nguyettran-agilityio/lunch-app/issues/11) | Regenerate `package-lock.json` so its root entry has `engines` (from phase 0) |
| [#12](https://github.com/nguyettran-agilityio/lunch-app/issues/12) | Guard hook parser misses commands hidden in variables or scripts (from phase 0) |
| [#18](https://github.com/nguyettran-agilityio/lunch-app/issues/18) | Shared meals, left for v2 (CN-36) |
