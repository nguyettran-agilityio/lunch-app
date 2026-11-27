---
name: start-milestone
description: Start a PR of a milestone in docs/plan.md - create the branch from the latest dev, ask the Lead the milestone's open points with ask-lead, write the plan with its consequences and the Lead's tasks, run the zero-questions test, then stop for approval. Use when the user asks to start a milestone or one of its PRs (for example M2-1), or says "bắt đầu M".
argument-hint: "[PR id of docs/plan.md, branch name, Lead notes]"
---

# Start a milestone PR

The rules live in `CLAUDE.md` ("How to work here", "Things Claude gets wrong" and **Git**) and in `docs/decisions.md` (G16, G18, G23, G24, X9). Follow them as written there; this skill only gives the order of the steps. If a rule here and in `CLAUDE.md` ever disagree, `CLAUDE.md` wins.

PR and notes from the user: $ARGUMENTS

Do not write code, commit or push in this skill.

## Steps

1. **Branch.** Use the `new-branch` skill with the name the user gave; with no name, ask for one.
2. **Read the milestone.** Read again, from the new branch: the PR's section of `docs/plan.md`, its "Open for the Lead", the parts of `docs/spec.md` and `docs/test-scenarios.md` it builds, and `docs/decisions.md`. Note the highest ids (CN, AC, B). Write any answers the user already gave in the request into the spec in their words, as `ask-lead` does.
3. **Ask the open points.** With the `ask-lead` skill, ask once every point of the milestone's "Open for the Lead" that this PR needs, and the places where the spec and the plan disagree. Each question has a concrete example and Claude's proposal. Points a later PR needs stay in its list.
4. **Write the plan** for the user, in Vietnamese in chat:
   - files and steps, and only what differs from the approved plan when there is one;
   - each technical choice the plan does not give yet, as a question with 2–3 options (G23); none is coded before the Lead answers;
   - for each decision, what breaks until a later PR, and the Lead's tasks outside the repo (accounts, keys, free-plan limits);
   - how to try the preview, as numbered steps with one action and one result each (G24).
5. **Zero-questions test.** Read only the repository and list every place where you would still have to ask or guess while coding this PR. Ask those now; write the points of a later milestone under its "Open for the Lead".
6. **Stop** and ask the Lead to approve the plan. The answers that change docs go into a docs PR of their own (G18), with `check-and-push`, only when the user asks.
