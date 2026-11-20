# Retro: phase 2, Design (PR #15–#17)

Phase 2 turned `docs/intent.md` into `docs/spec.md` and then into a clickable prototype that the Lead tried for one day. Written on 2026-11-20 from the git log, the descriptions of PR #15–#17, `CLAUDE.md`, `docs/spec.md` and `docs/test-scenarios.md`, and from the two prompts the user reported retyping. The transcripts of earlier sessions were not read, so the counts below are what the repo shows plus what the user reported.

## What was done

| PR | Title | Merge on `dev` | Result |
|---|---|---|---|
| [#15](https://github.com/nguyettran-agilityio/lunch-app/pull/15) | Implement product spec from intent | Squash 2a7e60b | Spec with BR-1–BR-32, AC1–AC20, OQ1–OQ12 and CN-1–CN-15 decided by the Lead in 6 rounds plus follow-ups; X5 |
| [#16](https://github.com/nguyettran-agilityio/lunch-app/pull/16) | Handle repeated Claude mistakes in CLAUDE.md | Squash a78d707 | Two lines in "Things Claude gets wrong" |
| [#17](https://github.com/nguyettran-agilityio/lunch-app/pull/17) | Implement clickable prototype from the spec | Squash 55d044b | Prototype for customer and shop, `spec-reviewer` agent, P1–P4, CN-16–CN-57, AC21–AC48, 333 tests, `docs/test-scenarios.md` |

Lead decisions recorded in the spec, by commit:

| Commit | Round | CN added |
|---|---|---|
| 2a7e60b (#15) | Writing the spec | CN-1–CN-15 |
| 7cc180e | Gaps found while building the prototype | CN-16–CN-25 |
| 5ecd065 | The Lead's day of testing on a phone | CN-26–CN-36 |
| 869cf8c | Reported transfers | CN-37–CN-52 (16 at once; replaces the last sentence of CN-24) |
| fcb1af0 | Pending refunds | CN-53–CN-55 |
| 441c3ae | Sorting and search | CN-56–CN-57 |

## Went well

- **Every gap went to the Lead.** 57 concerns and 96 "Resolved by Lead" lines, each with the Lead's choice in full. The intent was left as asked (X5).
- **`spec-reviewer` caught real defects.** Each run found defects that were then fixed with a test that fails on the old code (PR #17, "How tested").
- **The Lead tried it for real.** One day on a phone through the Vercel preview gave the feedback rounds CN-26 to CN-57.
- **Honest "Not checked".** The PR said what was clicked only by hand (AC24, AC27, AC28), what had no test (AC18, AC19) and that the first `spec-reviewer` run used a general-purpose agent.
- **Phase 0 rules held.** No hook was worked around, decision IDs stayed unique (X3 test), and chat stayed in Vietnamese.

## Went wrong

### Claude

| Mistake | Times | Evidence |
|---|---|---|
| Pushed after running only part of the check | 1 in the repo; the user retyped "full check" many times | CI of PR #17 failed on the `react-hooks/purity` lint rule; fixed in a5f8a35 |
| Built behaviour the spec did not cover, then asked only after `spec-reviewer` found it | Every `spec-reviewer` run in PR #17 | Open points decided after the code: CN-43–CN-52, CN-55, CN-57. "Adding rules the user has not decided" was already in `CLAUDE.md` |
| Asked about one case at a time instead of the whole group | 2 areas | Money: CN-37–CN-52 needed three `spec-reviewer` runs, each with new questions, and replaced part of CN-24. #15: two follow-ups on when orders move to Preparing |
| Money bugs found by the Lead, not by tests | 2 | A cancelled paid order showed 0 received (1cf7d86); a reported order edited up asked for the full amount again (869cf8c) |

### Process

- **`spec-reviewer` had fixed data.** It named BR-1…BR-32 and AC1…AC48 and knew only `prototype-logic.test.ts`, so it went stale with every round and did not see `screens.test.tsx` or the scenarios.
- **Scenarios came last.** `docs/test-scenarios.md` was added in the last commit of PR #17 and had no scenario for the first flows (ordering, plates, cutoff, preparation, delivery).
- **One PR for every round.** PR #17 took five rounds of feedback in nine commits; its "How tested" became a stack of rounds.

## Proposals

Rule used, as in phase 0: a mistake seen 2 times goes into `CLAUDE.md`; a mistake seen 1 time gets a hook or an automatic check; a prompt retyped 2 times becomes a skill. The user chose every item below.

| Problem | Rule | Action | Where |
|---|---|---|---|
| Push after part of the check | `CLAUDE.md` + skill | New line in "Things Claude gets wrong"; the `check-and-push` skill runs all four commands before every push | `CLAUDE.md`, G12 |
| Code first, ask after | `CLAUDE.md` + skill | New line in "Things Claude gets wrong": list the gaps and ask before writing code; the `ask-lead` skill does the asking | `CLAUDE.md`, G13 |
| "Run spec-reviewer + full check + push" retyped | Skill | `check-and-push` | G12 |
| "Review the whole group, ask me with options, then write the spec" retyped | Skill | `ask-lead`, which also covers asking one case at a time | G13 |
| `spec-reviewer` fixed data, money combinations, open points without options | Agent | Reads ids from the spec, looks at all test files and the scenarios, checks every money combination, groups open points with 2–3 options | P5 |
| Scenarios came last | Process | Scenarios written as "Planned" before the code; section 11 adds the first flows | X6 |
| Untested acceptance criteria seen only when `spec-reviewer` ran | Automatic check | `__tests__/spec-coverage.test.ts` in CI | X7 |
| One PR for every round | Process | One PR per round of Lead feedback | G14 |

Not chosen: a `CLAUDE.md` line for asking one case at a time; `ask-lead` covers it.

Added by the user after reviewing the proposals:

- The exceptions of the coverage test hold for the prototype only; in the Code step every acceptance criterion must have a test (X7).
- Both skill descriptions keep a Vietnamese trigger phrase, as an exception to X2 like `open-pr` (G12, G13).
- A known defect is fixed right away, not only written into the PR; if it cannot be fixed, Claude asks the user. In "How to work here" in `CLAUDE.md`, and `check-and-push` fixes every defect whatever its severity (G15).

## Not checked

- The new skills and the changed agent load only in a new session; they were not run in this one.
- The scenarios in section 11 of `docs/test-scenarios.md` were clicked in the first round of PR #17 (8eeeba1), not again on the current code.

## Open issues

| Issue | Topic |
|---|---|
| [#8](https://github.com/nguyettran-agilityio/lunch-app/issues/8) | Company email in commit history on a public repo (from phase 0) |
| [#10](https://github.com/nguyettran-agilityio/lunch-app/issues/10) | Check the Vercel production deployment on the first `dev` → `main` release (from phase 0) |
| [#11](https://github.com/nguyettran-agilityio/lunch-app/issues/11) | Regenerate `package-lock.json` so its root entry has `engines` (from phase 0) |
| [#12](https://github.com/nguyettran-agilityio/lunch-app/issues/12) | Guard hook parser misses commands hidden in variables or scripts (from phase 0) |
| [#18](https://github.com/nguyettran-agilityio/lunch-app/issues/18) | Shared meals, left for v2 (CN-36) |
