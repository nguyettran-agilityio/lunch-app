# Decisions

Technical and process decisions for this repo, newest last. Product decisions (D1–D23) and open questions live in [intent.md](intent.md) and are not repeated here.

Add a row when a new decision is made. Everything in this file is in English. When a decision comes from the user, the Source column gives the user's words translated into English in full: do not shorten, summarize or reword their meaning.

## Stack and tooling

| # | Topic | Decision | Why | Source |
|---|---|---|---|---|
| T1 | Framework | Next.js 16.4.6 (App Router, `src/app`), React 19.3, TypeScript | Created with `create-next-app` | 531f469 |
| T2 | Next.js config | `cacheComponents: true` and `partialPrefetching: true` in `next.config.ts` | Set at project creation | 531f469 |
| T3 | Styling | Tailwind CSS 4.3.3, loaded through Turbopack with `@tailwindcss/turbopack` | Set at project creation | 531f469 |
| T4 | React Compiler | Not used | User decision | User: "No React Compiler" |
| T5 | `AGENTS.md` | Keep the `AGENTS.md` written by `next dev`, and read the guides in `node_modules/next/dist/docs/` before writing Next.js code; `CLAUDE.md` imports it with `@AGENTS.md` | This Next.js version has breaking changes compared with older knowledge | 531f469; user: "Keep AGENTS.md" |
| T6 | Node.js version | Node 26: `.nvmrc` = `26` for local and CI, `package.json` `engines.node` = `26.x` for Vercel. Verified by the user: Vercel builds run Node v26 | One major version everywhere; the version lives in the repo and is reviewed in PRs, not in the Vercel dashboard | #1, #3; user: "I have checked Node 26 on Vercel; it is running v26." |
| T7 | Test runner | Vitest 4 with jsdom and Testing Library, following the Next.js Vitest guide; tests in `__tests__/` | Vitest 5 needs `@types/node@^22 \|\| >=24` and fails to install next to `@types/node@^20`; Vitest 4 needs no other upgrade | #1 |
| T8 | Type check | `npm run typecheck` = `next typegen && tsc --noEmit` | `next-env.d.ts` and `.next/types` are git-ignored, so `tsc` alone fails on a clean checkout | #1 |
| T9 | npm audit | Leave the `picomatch` ReDoS advisory (GHSA-fc5q-39xc-vjpf) as is | Dev-only dependencies, nothing ships to production, and `npm audit fix --force` would only downgrade majors | #1 |
| T10 | Dependabot | Turned off on purpose | User decision | User: "Dependabot is turned off on purpose" |
| T11 | Paid AI APIs | The app does not call paid AI APIs | User decision | User: "Do not call paid AI APIs" |
| T12 | REA | Do not use REA (the reverse-engineer-anything skill) in this repo | User decision | User: "Do not use REA" |
| T13 | Local Claude settings | `.claude/settings.local.json` is git-ignored | Personal permissions, not shared | 531f469 |

## Docs and language

| # | Topic | Decision | Why | Source |
|---|---|---|---|---|
| X1 | Intent source of truth | The English `docs/intent.md` is the original; any other language version follows it | User decision | User: "The English intent is the original" |
| X2 | Language | Every file committed and pushed to git (code, commit messages, PR titles and descriptions, `CLAUDE.md`, everything in `docs/` including this file) is entirely in English. Replies to the user in chat are in Vietnamese | User decision | User: "Reply in Vietnamese"; "All code files and everything pushed to git must be entirely in English, including decisions." |

## CI and deployment

| # | Topic | Decision | Why | Source |
|---|---|---|---|---|
| C1 | CI | One job `ci` on pull requests to `dev` and `main`: `npm ci` → lint → typecheck → test → build, `permissions: contents: read` | Same checks as local, least privilege | #1 |
| C2 | Branch protection | Ruleset `protect-main-dev` on `main` and `dev`: PR required, `ci` check required, no force push, no deletion | Every change goes through review and CI | #2 |
| C3 | Production | Vercel; `main` is production | User decision | #3; user: "main = production" |
| C4 | Preview deployments | Vercel creates a preview deployment for every PR, and previews are public | User decision | User: "Vercel previews are public" |

## Git and PR workflow

| # | Topic | Decision | Why | Source |
|---|---|---|---|---|
| G1 | Default branch | `dev` is the default and integration branch | User decision | User: "dev is the default branch" |
| G2 | Branches | Work on `feat/<short-name>` branches created from an up-to-date `dev` (pull `dev` first); release with a PR `dev` → `main` | Keep `main` = production; start from the latest code | #1–#3; user: "Create branches from a dev that has been pulled" |
| G3 | Merge method | Squash merge for PRs into `dev`; merge commit for PRs `dev` → `main`; rebase merge turned off. PR #1 and #3 were merged with merge commits by mistake. In fact PR #2 was also merged with a merge commit (d050437) | User decision | User: "PR #1 and #3 were actually merged with merge commits by mistake; the decision is still squash into dev, merge commit when dev → main, rebase turned off." |
| G4 | Head branches | Deleted automatically after merge (repo setting) | Keep the branch list clean | Repo settings |
| G5 | PR template | One template, `.github/pull_request_template.md`: Summary, Changes, Decisions, How tested, Not checked, Related; guidance in HTML comments | One template covers all PRs; "Not checked" makes testing gaps explicit | #2 |
| G6 | Attribution | No `Co-Authored-By: Claude ...` trailer (or any other Claude co-author line) in commit messages; no "🤖 Generated with Claude Code" line (or any other Claude attribution) in PR descriptions | User decision, also in the user's personal `~/.claude/CLAUDE.md` | User: "Keep the rule of not crediting Claude, but record the source as my decision." |
| G7 | Capitalization | Commit messages and PR titles start with a capital letter | User decision | User: "Commit messages and PR titles start with a capital letter" |
| G8 | PR title format | PR titles use the form `Implement <content>`, `Integrate <content>` or `Handle <content>` | User decision | User: "PR titles in the form Implement/Integrate/Handle <content>" |
| G9 | Opening PRs | Open PRs with the `gh` CLI | User decision | User: "Open PRs with gh" |
