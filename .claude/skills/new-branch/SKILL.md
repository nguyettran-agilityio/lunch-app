---
name: new-branch
description: Create a new feature branch from the latest dev, following this repo's branch rule. Use when the user asks to start work on a new branch, or says "tạo nhánh ... từ dev mới nhất".
argument-hint: "<short-name or feat/short-name>"
allowed-tools: Bash(git status *) Bash(git fetch *) Bash(git checkout *) Bash(git pull *) Bash(git branch *) Bash(git log *)
---

# New branch from the latest dev

The rules live in the **Git** section of `CLAUDE.md` and in G2 of `docs/decisions.md`. Follow them as written there; this skill only gives the order of the steps. If a rule here and in `CLAUDE.md` ever disagree, `CLAUDE.md` wins.

Branch name from the user: $ARGUMENTS

## Steps

1. **Name.** Take the name from the user. Add the `feat/` prefix if it is missing. The short name is lower case words joined by `-`. No name given: stop and ask the user.
2. **Working tree.** Run `git status --short`. Uncommitted changes to tracked files: stop and ask the user what to do with them; do not stash, commit or discard them on your own. Untracked files are carried over; mention them in the report.
3. **Latest dev.** `git fetch origin`, `git checkout dev`, `git pull --ff-only origin dev`. If the pull is not a fast-forward, stop and tell the user.
4. **Branch.** If a local or remote branch with that name already exists (`git branch -a --list "*<name>"`), stop and ask the user. Otherwise `git checkout -b <name>`.
5. **Report** to the user in Vietnamese: the branch name, the `dev` commit it starts from (`git log --oneline -1`), and any untracked files carried over. Then go on with the rest of the user's request.

Never commit or push in this skill.
