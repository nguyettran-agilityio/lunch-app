@AGENTS.md

# lunch-app

Office lunch ordering app (Next.js 16, React 19, Tailwind 4, Vitest). Product intent and decisions D1–D23: [docs/intent.md](docs/intent.md). Technical and process decisions: [docs/decisions.md](docs/decisions.md).

## How to work here

- Reply to the user in Vietnamese in chat. Every file committed and pushed to git (code, commit messages, PR titles and descriptions, `CLAUDE.md`, everything in `docs/` including `decisions.md`) must be entirely in English.
- If a requirement is unclear or not covered by `docs/`, ask the user before acting. Do not guess.
- Do not add React Compiler, call paid AI APIs, use REA, or turn on Dependabot (see `docs/decisions.md`).
- When the user makes a new decision, add it to `docs/decisions.md` (technical/process) or tell them it belongs in `docs/intent.md` (product).

## Check (same as CI)

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Run it before every commit; all four must exit 0. Use Node 26 (`.nvmrc`).

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
