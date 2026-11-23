@AGENTS.md

# lunch-app

Office lunch ordering app (Next.js 16, React 19, Tailwind 4, Vitest). Product intent and decisions D1–D23: [docs/intent.md](docs/intent.md). Technical and process decisions: [docs/decisions.md](docs/decisions.md). How the app is built, milestone by milestone: [docs/plan.md](docs/plan.md).

## How to work here

- Reply to the user in Vietnamese in chat. Every file committed and pushed to git (code, commit messages, PR titles and descriptions, `CLAUDE.md`, everything in `docs/` including `decisions.md`) must be entirely in English.
- If a requirement is unclear or not covered by `docs/`, ask the user before acting. Do not guess.
- Do not add React Compiler, call paid AI APIs, use REA, or turn on Dependabot (see `docs/decisions.md`).
- When the user makes a new decision, add it to `docs/decisions.md` (technical/process) or tell them it belongs in `docs/intent.md` (product).
- Fix a known defect right away; do not only write it down in the PR (for example under "Not checked"). If you cannot fix it, ask the user (see `docs/decisions.md` G15).

## Check (same as CI)

```bash
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Run it before every commit; all six must exit 0. If `format:check` fails, run `npm run format` (Prettier, decision T14). Use Node 26 (`.nvmrc`). `npm run test:e2e` (Playwright, decisions B11 and B19) arrives with PR M1-1c of [docs/plan.md](docs/plan.md); until that PR is merged, the script does not exist and the check is the first five commands.

## Git

- Pull `dev` first, then branch from it as `feat/<short-name>`; never commit directly to `dev` or `main` (both are protected).
- Commit messages and PR titles start with a capital letter.
- PR titles use the form `Implement <content>`, `Integrate <content>` or `Handle <content>`.
- Open PRs into `dev` with `gh pr create` and fill every section of `.github/pull_request_template.md`.
- Merge: squash for PRs into `dev`, merge commit for PRs `dev` → `main`; rebase merge is off. `main` is production.
- Commit or push only when the user asks.
- Hooks in `.claude/settings.json` enforce the dangerous-action rules (see `docs/decisions.md` G10). If a hook blocks you, tell the user the reason; do not work around it.
- No `Co-Authored-By: Claude ...` trailer (or any other Claude co-author line) in commit messages, and no "🤖 Generated with Claude Code" line (or any other Claude attribution) in PR descriptions. This is the user's decision (see `docs/decisions.md` G6).

## Things Claude gets wrong

When Claude makes the same mistake a second time, add it here as one line: the mistake, then what to do instead.

- Shortening or rewording the user's decisions when writing them down. Record the user's decisions in full (translated into English for committed files); do not summarize or shorten them.
- Ending a report to the user with a summary in English. Everything said to the user in chat, including recaps and summaries, must be in Vietnamese.
- Adding rules the user has not decided (in specs, decisions or docs), or changing on your own the wording of an acceptance criterion or a plan the user has already approved (for example the wording of AC42, or the transition in `docs/plan.md`). Write down only what the user decided; when something is not decided, or an approved AC or plan needs to change, ask the user first instead of filling the gap.
- Giving a new decision an ID that is already taken because an old copy of the file was read. Always pull `dev` and read the file again before adding a new ID.
- Pushing, or reporting work as done, after running only part of the check (for example only the tests). Run every command of the **Check** section before every push; the `check-and-push` skill does this.
- Building behaviour the spec does not cover, or writing a plan for it, then asking the Lead only after `spec-reviewer` or the Lead finds it. Before writing code or a plan, list every place the change needs that the spec does not say, ask the Lead (the `ask-lead` skill), write the answers into the spec, then write the code or the plan. Before showing a plan for approval, run the zero-questions test yourself: read only the repository and list every place you would still have to ask or guess while coding the next milestone. Ask now only the points the next milestone needs; write the points of a later milestone under "Open for the Lead" of that milestone in `docs/plan.md`, and ask them when that milestone starts.
- Showing a plan for approval without its consequences. Before asking the Lead to approve a plan, write for each decision what breaks between milestones (for example screens that stop working until a later milestone) and what the Lead has to do outside the repo (accounts, domains, free-plan limits, how to try it).
- Working around a hook that blocked, even by mistake: rewriting the command or the text so it passes, or switching to another tool. Stop, tell the user the reason and wait (see **Git**).
- Putting several jobs in one PR (PR #17 in Design; PR #21 held a spec round, the plan and prototype code). One PR does one job; when an answer from `ask-lead` leads to changes in another part (for example prototype code during the Plan step), open a separate PR for them.
