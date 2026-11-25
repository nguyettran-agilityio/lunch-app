#!/usr/bin/env node
// PreToolUse guard for Claude Code (see .claude/settings.json and docs/decisions.md G10).
//
// Reads the hook input JSON on stdin. Exit 0 = no objection (normal permission flow applies).
// Exit 2 = block; the stderr text is shown to Claude as the reason.
//
// The guard fails closed: invalid JSON, missing fields, an unknown tool or any internal error
// also exits 2 with a reason. It only parses strings; it never runs the command it checks.
//
// Blocked:
//   - git push to main/dev (explicit refspec, or a bare push while on main/dev), --all/--mirror
//   - force push (-f, --force, --force-with-lease, --force-if-includes, +refspec)
//   - gh pr merge, gh api .../merge, the GitHub MCP merge tool
//   - reading, writing or copying .env* files (file tools, Grep/Glob paths, Bash file arguments,
//     redirections, inline interpreter code). The name only as text (file content, commit
//     messages, PR bodies, search patterns, here-document text) is allowed.
//   - production deploys with the Vercel CLI
//   - rm / git rm / rmdir / unlink / find -delete on docs/ (or a parent of docs/)
//   - writing, editing, moving or deleting .claude/settings.json, .claude/settings.local.json or
//     files in .claude/hooks/ (file tools, Bash output redirections and file arguments,
//     sed/perl -i, git checkout/restore/mv). Reading them, and git add/commit, are allowed.
//   - changing files in the repo from Bash (G19): output redirections, tee, dd, truncate,
//     sed/perl -i, cp/install/rsync, git apply, patch and npm pkg set into the repo; inline
//     interpreter code that writes a file anywhere; running a script file from outside the repo
//     (an interpreter, a shell, tsx/ts-node/bun/deno, npx/npm exec/pnpm/yarn/bunx, source, or
//     the file itself by its path). A path the guard cannot resolve counts as in the repo.
//
// Commands after shell keywords (do, then, else, {, !) and wrappers (env, sudo, timeout, ...)
// are checked by every rule.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROTECTED_BRANCHES = ['main', 'dev']
const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

class Block extends Error {}

function block(reason) {
  throw new Block(reason)
}

function fail(reason) {
  try {
    writeSync(2, `Blocked by .claude/hooks/guard.mjs: ${reason}\n`)
  } finally {
    process.exit(2)
  }
}

process.on('uncaughtException', (err) => fail(`guard crashed (${err?.message ?? err}); failing closed.`))
process.on('unhandledRejection', (err) => fail(`guard crashed (${err?.message ?? err}); failing closed.`))

// ---------- input ----------

function readInput() {
  let raw
  try {
    raw = readFileSync(0, 'utf8')
  } catch (err) {
    block(`could not read hook input from stdin (${err.message}); failing closed.`)
  }
  if (!raw || !raw.trim()) block('hook input on stdin is empty; failing closed.')
  let input
  try {
    input = JSON.parse(raw)
  } catch (err) {
    block(`hook input is not valid JSON (${err.message}); failing closed.`)
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    block('hook input is not a JSON object; failing closed.')
  }
  requireString(input, 'tool_name', 'hook input')
  requireString(input, 'cwd', 'hook input')
  if (!input.tool_input || typeof input.tool_input !== 'object' || Array.isArray(input.tool_input)) {
    block('hook input is missing the "tool_input" object; failing closed.')
  }
  return input
}

function requireString(obj, key, where) {
  if (typeof obj[key] !== 'string' || obj[key] === '') {
    block(`${where} is missing the string field "${key}"; failing closed.`)
  }
  return obj[key]
}

// ---------- .env* ----------

const ENV_REASON =
  'reading, writing or copying .env* files is not allowed (they hold secrets). Ask the user to check or change the value themselves.'

function isEnvName(p) {
  const base = path.basename(p)
  if (base.startsWith('.env')) return true
  if (/[*?[{]/.test(base)) {
    return ['.env', '.env.local', '.env.production'].some((n) => path.matchesGlob(n, base))
  }
  return false
}

// A .env* name inside inline interpreter code (node -e, python -c, ...), which can open files.
const ENV_IN_CODE = /(^|[^\w.$-])\.env[\w.*-]*/

// String literals in code ('…', "…", '''…''', """…"""). A literal with whitespace is text, unless
// it holds a .env* path (…/.env). Code that runs a string as code or as a shell command is
// checked whole.
const STRING_LITERAL = /'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g
const RUNS_STRING = /\b(system|popen|Popen|subprocess|exec\w*|spawn\w*|eval|child_process|shell_exec|passthru|qx)\b|%x/

// Does inline or here-document code name a .env* file?
function codeNamesEnv(code) {
  if (RUNS_STRING.test(code)) return ENV_IN_CODE.test(code)
  const kept = code.replace(STRING_LITERAL, (lit) => (/\s/.test(lit) && !/\/\.env/.test(lit) ? '""' : lit))
  return ENV_IN_CODE.test(kept)
}

// Commands whose arguments are text, not files (redirections are still checked).
const TEXT_COMMANDS = new Set(['echo', 'printf', ':', 'true', 'false'])
// Commands whose first positional argument is a pattern or program, not a file.
const PATTERN_FIRST = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'sed', 'awk', 'gawk', 'jq'])
const PATTERN_FLAGS = new Set(['-e', '--regexp', '--expression'])
// Inline-code flags: their value is code, scanned for .env* names.
const INTERPRETERS = {
  node: ['-e', '-p', '--eval', '--print'],
  python: ['-c'],
  python3: ['-c'],
  ruby: ['-e'],
  perl: ['-e', '-E'],
  php: ['-r'],
}
// Flags whose value is a message or other text.
const TEXT_FLAGS = {
  git: new Set(['-m', '--message']),
  gh: new Set(['-t', '--title', '-b', '--body', '-n', '--notes', '--subject', '-f', '--raw-field']),
}
// --option=value forms whose value is text.
const TEXT_EQ_OPTIONS = new Set(['--grep', '--message', '--body', '--title', '--notes', '--subject', '--author', '--format', '--pretty'])

// Does this single shell word name a .env* file? Words with spaces are text, not paths.
function wordNamesEnv(w) {
  if (/\s/.test(w)) return false
  const opt = w.match(/^(--?[\w-]+)=(.*)$/s)
  if (opt) return !TEXT_EQ_OPTIONS.has(opt[1]) && wordNamesEnv(opt[2])
  const assign = w.match(/^[A-Za-z_]\w*=(.*)$/s)
  if (assign) return wordNamesEnv(assign[1])
  return w !== '' && isEnvName(w.replace(/^@/, '')) // @file, as in curl -d @.env or gh -F x=@.env
}

// Block when a .env* file is the target of a redirection or a file argument of the command.
function checkEnvFiles(words, redirects) {
  if (redirects.some(wordNamesEnv)) block(ENV_REASON)
  const head = path.basename(words[0])
  if (TEXT_COMMANDS.has(head)) return
  const args = words.slice(1)
  const skip = new Set()
  if (head in INTERPRETERS) {
    args.forEach((a, i) => {
      if (INTERPRETERS[head].includes(a) && args[i + 1] !== undefined) {
        if (codeNamesEnv(args[i + 1])) block(ENV_REASON)
        skip.add(i + 1)
      }
    })
  }
  if (head in TEXT_FLAGS) {
    args.forEach((a, i) => {
      if (TEXT_FLAGS[head].has(a)) skip.add(i + 1)
    })
  }
  if (head === 'git') {
    // check-ignore and check-attr compare names with .gitignore/.gitattributes; they do not open the
    // file. Redirections are still checked above.
    let j = 0
    while (j < args.length && args[j].startsWith('-')) {
      j += ['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(args[j]) ? 2 : 1
    }
    if (['check-ignore', 'check-attr'].includes(args[j])) {
      args.forEach((_a, k) => {
        if (k > j) skip.add(k)
      })
    }
  }
  if (PATTERN_FIRST.has(head)) {
    // -e gives the pattern inline (skipped); -f gives it in a file (still checked). Either way
    // there is no positional pattern.
    const explicit = args.some((a) => PATTERN_FLAGS.has(a) || a === '-f' || a === '--file')
    args.forEach((a, i) => {
      if (PATTERN_FLAGS.has(a)) skip.add(i + 1)
    })
    if (!explicit) {
      const first = args.findIndex((a, i) => !a.startsWith('-') && !skip.has(i))
      if (first !== -1) skip.add(first)
    }
  }
  args.forEach((a, i) => {
    if (!skip.has(i) && wordNamesEnv(a)) block(ENV_REASON)
  })
}

// Split out here-document bodies: they are text fed to stdin, not file names. Returns the
// command text without bodies, plus each body with the line that opened it, so bodies fed to
// a shell or an interpreter can still be checked as code.
function splitHeredocs(src) {
  const out = []
  const bodies = []
  const pending = []
  for (const line of src.split('\n')) {
    if (pending.length) {
      const d = pending[0]
      if ((d.dash ? line.replace(/^\t+/, '') : line) === d.word) {
        bodies.push({ opener: d.opener, body: d.lines.join('\n'), quoted: d.quoted })
        pending.shift()
      } else {
        d.lines.push(line)
      }
      continue
    }
    out.push(
      line.replace(/(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_][\w.-]*)\2/g, (_m, dash, q, word) => {
        pending.push({ dash: dash === '-', word, quoted: q !== '', opener: line, lines: [] })
        return ' '
      }),
    )
  }
  // An unterminated here-document runs to the end of the input.
  for (const d of pending) bodies.push({ opener: d.opener, body: d.lines.join('\n'), quoted: d.quoted })
  return { text: out.join('\n'), bodies }
}

const SHELL_OPENER = /(^|[|;&(]\s*)(sudo\s+)?(bash|sh|zsh|dash|ksh|eval)\b/
const CODE_OPENER = /(^|[|;&(]\s*)(sudo\s+)?(node|python3?|ruby|perl|php)\b/

// ---------- shell parsing ----------

// Split a command line into simple commands ({ words, redirects }). Handles quotes, backslashes,
// operators (; & | && || newline, parentheses) and redirections. Not a full shell parser.
function splitCommands(src) {
  const commands = []
  let words = []
  let redirects = []
  let outputs = [] // targets of output redirections (> and >>), a subset of redirects
  let cur = null
  let redirectNext = false
  let redirectOut = false
  let redirectDup = false // >&N, N>&-: a file descriptor, not a file
  const pushWord = () => {
    if (cur !== null) {
      ;(redirectNext ? redirects : words).push(cur)
      if (redirectNext && redirectOut && !(redirectDup && /^(\d+|-)$/.test(cur))) outputs.push(cur)
      redirectNext = false
    }
    cur = null
  }
  const endCommand = () => {
    pushWord()
    if (words.length || redirects.length) commands.push({ words, redirects, outputs })
    words = []
    redirects = []
    outputs = []
    redirectNext = false
  }
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '\\') {
      if (src[i + 1] === '\n') {
        i++
        continue
      }
      cur = (cur ?? '') + (src[i + 1] ?? '')
      i++
    } else if (c === "'") {
      const end = src.indexOf("'", i + 1)
      const stop = end === -1 ? src.length : end
      cur = (cur ?? '') + src.slice(i + 1, stop)
      i = stop
    } else if (c === '"') {
      let j = i + 1
      let buf = ''
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < src.length) {
          buf += src[j + 1]
          j += 2
        } else {
          buf += src[j++]
        }
      }
      cur = (cur ?? '') + buf
      i = j
    } else if (c === '#' && cur === null) {
      const nl = src.indexOf('\n', i)
      i = nl === -1 ? src.length : nl - 1
    } else if (';&|\n()'.includes(c)) {
      endCommand()
    } else if (c === '<' || c === '>') {
      // Redirection: the next word is the target file. A number right before it (2>) is a file
      // descriptor, not a word.
      if (cur !== null && /^\d+$/.test(cur)) cur = null
      pushWord()
      redirectOut = c === '>'
      redirectDup = false
      if (c === '>' && src[i + 1] === '|') i++ // >| (overwrite even with noclobber)
      while (src[i + 1] === '>' || src[i + 1] === '&' || src[i + 1] === '<') {
        if (src[i + 1] === '&') redirectDup = true
        i++
      }
      redirectNext = true
    } else if (/\s/.test(c)) {
      pushWord()
    } else {
      cur = (cur ?? '') + c
    }
  }
  endCommand()
  return commands
}

// Text inside $( ... ) and backticks, so nested commands are checked too.
// Single-quoted text is literal in the shell, so it is skipped.
function substitutions(src) {
  const found = []
  let inDouble = false
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\\') {
      i++
    } else if (src[i] === '"') {
      inDouble = !inDouble
    } else if (src[i] === "'" && !inDouble) {
      const end = src.indexOf("'", i + 1)
      if (end === -1) break
      i = end
    } else if (src[i] === '$' && src[i + 1] === '(') {
      let depth = 1
      let j = i + 2
      while (j < src.length && depth > 0) {
        if (src[j] === '(') depth++
        else if (src[j] === ')') depth--
        j++
      }
      found.push(src.slice(i + 2, j - 1))
      i = j - 1
    } else if (src[i] === '`') {
      const end = src.indexOf('`', i + 1)
      if (end === -1) break
      found.push(src.slice(i + 1, end))
      i = end
    }
  }
  return found
}

const WRAPPERS = new Set(['sudo', 'command', 'exec', 'nohup', 'time', 'builtin', 'nice', 'caffeinate'])
// Shell keywords a command can follow (for f in …; do rm …; done, if …; then …; fi, { …; }).
const SHELL_KEYWORDS = new Set(['do', 'then', 'else', 'elif', 'if', 'while', 'until', '!', '{'])

function stripPrefixes(words) {
  let w = [...words]
  for (;;) {
    while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) w.shift()
    if (!w.length) return w
    const head = path.basename(w[0])
    if (SHELL_KEYWORDS.has(w[0])) {
      w.shift()
    } else if (head === 'timeout') {
      // timeout [-s SIGNAL] [-k DURATION] DURATION command
      w.shift()
      while (w.length && w[0].startsWith('-')) w.splice(0, ['-s', '--signal', '-k', '--kill-after'].includes(w[0]) ? 2 : 1)
      w.shift()
    } else if (head === 'env') {
      w.shift()
      while (w.length && (w[0].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]))) w.shift()
    } else if (WRAPPERS.has(head)) {
      w.shift()
      while (w.length && w[0].startsWith('-')) w.shift()
    } else {
      return w
    }
  }
}

// ---------- git ----------

function gitOutput(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 3000,
  }).trim()
}

function currentBranch(cwd) {
  try {
    return gitOutput(cwd, ['branch', '--show-current'])
  } catch {
    return null
  }
}

function branchName(ref) {
  return ref.replace(/^refs\/heads\//, '').replace(/^heads\//, '')
}

function checkGitPush(args, cwd) {
  const positional = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') {
      positional.push(...args.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      if (/^--force(-with-lease|-if-includes)?(=|$)/.test(a)) {
        block('force push is not allowed. Push normally; if history must be rewritten, ask the user.')
      }
      if (a === '--all' || a === '--mirror' || a === '--branches') {
        block(`"git push ${a}" would push the protected branches main/dev. Push only your feat/* branch.`)
      }
      if (['--repo', '--receive-pack', '--exec', '--push-option'].includes(a)) i++
      continue
    }
    if (a.startsWith('-') && a.length > 1) {
      const flags = a.slice(1)
      if (flags.includes('f')) {
        block('force push is not allowed. Push normally; if history must be rewritten, ask the user.')
      }
      if (flags.endsWith('o')) i++
      continue
    }
    positional.push(a)
  }
  const refspecs = positional.slice(1)
  for (const spec of refspecs) {
    if (spec.startsWith('+')) {
      block(`"+${spec.slice(1)}" is a force push, which is not allowed.`)
    }
    const dst = spec.includes(':') ? spec.slice(spec.indexOf(':') + 1) : spec
    let target = branchName(dst)
    if (target === 'HEAD' || target === '@') {
      target = currentBranch(cwd)
      if (target === null) {
        block('could not determine the current branch for "git push HEAD"; failing closed.')
      }
    }
    if (PROTECTED_BRANCHES.includes(target)) {
      block(
        `pushing directly to "${target}" is not allowed (protected branch). Push a feat/* branch and open a PR into dev.`,
      )
    }
  }
  if (refspecs.length === 0) {
    const branch = currentBranch(cwd)
    if (branch === null) {
      block('could not determine the current branch for a bare "git push"; failing closed.')
    }
    if (PROTECTED_BRANCHES.includes(branch)) {
      block(
        `you are on "${branch}", so "git push" would push directly to a protected branch. Create a feat/* branch from dev instead.`,
      )
    }
  }
}

function checkGit(words, cwd) {
  let i = 1
  let dir = cwd
  while (i < words.length && words[i].startsWith('-')) {
    const opt = words[i]
    if (opt === '-C') {
      dir = path.resolve(dir, words[i + 1] ?? '')
      i += 2
    } else if (['-c', '--git-dir', '--work-tree', '--namespace'].includes(opt)) {
      i += 2
    } else {
      i++
    }
  }
  const sub = words[i]
  const rest = words.slice(i + 1)
  if (sub === 'push') checkGitPush(rest, dir)
  if (sub === 'rm') checkDocsTargets(rest.filter((a) => !a.startsWith('-')), dir, 'git rm')
  checkGitGuardFiles(sub, rest, dir)
  if (sub === 'apply') checkGitApply(rest, dir)
}

// ---------- gh ----------

function checkGh(words) {
  const args = []
  for (let i = 1; i < words.length; i++) {
    if (words[i] === '-R' || words[i] === '--repo') {
      i++
      continue
    }
    if (words[i].startsWith('--repo=')) continue
    args.push(words[i])
  }
  if (args[0] === 'pr' && args[1] === 'merge') {
    block('merging pull requests is not allowed for Claude. The user merges PRs on GitHub.')
  }
  if (args[0] === 'api' && args.some((a) => /\/pulls\/[^/\s]+\/merge\b/.test(a))) {
    block('merging pull requests through "gh api" is not allowed. The user merges PRs on GitHub.')
  }
}

// ---------- vercel ----------

const RUNNERS = {
  npx: 1,
  bunx: 1,
  pnpx: 1,
  pnpm: 2, // pnpm dlx vercel / pnpm exec vercel
  yarn: 2, // yarn dlx vercel
  npm: 2, // npm exec vercel
}

function vercelArgs(words) {
  const head = path.basename(words[0])
  if (head === 'vercel' || head === 'vc') return words.slice(1)
  if (head in RUNNERS) {
    const rest = words.slice(1).filter((w) => !w.startsWith('-'))
    if (RUNNERS[head] === 2 && !['dlx', 'exec', 'x'].includes(rest[0])) return null
    const pkg = RUNNERS[head] === 2 ? rest[1] : rest[0]
    if (pkg && /^(vercel|vc)(@.*)?$/.test(pkg)) {
      return words.slice(words.indexOf(pkg) + 1)
    }
  }
  return null
}

function checkVercel(args) {
  const prod = args.some(
    (a, i) =>
      a === '--prod' ||
      a === '--production' ||
      /^--prod(uction)?=(true|1)?$/.test(a) ||
      a === '--target=production' ||
      (a === '--target' && args[i + 1] === 'production'),
  )
  const sub = args.find((a) => !a.startsWith('-'))
  if (prod || ['promote', 'rollback', 'alias', 'redeploy'].includes(sub)) {
    block(
      'production deploys are not allowed. main is production and deploys through Vercel after a dev → main PR.',
    )
  }
}

// ---------- docs/ deletion ----------

function projectRoots(cwd) {
  const roots = new Set([SCRIPT_ROOT])
  try {
    roots.add(gitOutput(cwd, ['rev-parse', '--show-toplevel']))
  } catch {
    // Not a git repo: the script's own root is still protected.
  }
  return [...roots]
}

const GLOB_CHARS = /[*?[{]/

function contains(parent, child) {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// True when deleting `target` (an absolute path, maybe a glob) could delete docs/ or files in it:
// target is docs/, inside docs/, a parent of docs/, or a glob that can match one of those.
function hitsDocs(target, docsDir) {
  if (!GLOB_CHARS.test(target)) return contains(docsDir, target) || contains(target, docsDir)
  const segs = target.split(path.sep)
  const firstGlob = segs.findIndex((s) => GLOB_CHARS.test(s))
  const base = segs.slice(0, firstGlob).join(path.sep) || path.sep
  if (contains(docsDir, base)) return true
  if (!contains(base, docsDir)) return false
  if (segs.includes('**')) return true
  const docsSegs = docsDir.split(path.sep)
  const n = Math.min(segs.length, docsSegs.length)
  return path.matchesGlob(docsSegs.slice(0, n).join(path.sep), segs.slice(0, n).join(path.sep))
}

function checkDocsTargets(targets, cwd, tool) {
  for (const root of projectRoots(cwd)) {
    const docsDir = path.join(root, 'docs')
    for (const t of targets) {
      const abs = path.resolve(cwd, t.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'))
      if (hitsDocs(abs, docsDir)) {
        block(`"${tool} ${t}" would delete files in docs/, which is not allowed. Ask the user to remove docs themselves.`)
      }
    }
  }
  checkGuardTargets(targets, cwd)
}

function checkDelete(words, cwd) {
  const head = path.basename(words[0])
  if (['rm', 'rmdir', 'unlink', 'shred', 'trash', 'srm'].includes(head)) {
    let endOfOpts = false
    const targets = words.slice(1).filter((a) => {
      if (endOfOpts) return true
      if (a === '--') {
        endOfOpts = true
        return false
      }
      return !a.startsWith('-')
    })
    checkDocsTargets(targets, cwd, head)
  }
  if (head === 'find' && words.some((w) => w === '-delete' || w === '-exec' || w === '-execdir' || w === '-ok')) {
    const deletes =
      words.includes('-delete') ||
      words.some((w, i) => ['-exec', '-execdir', '-ok'].includes(w) && /^(rm|rmdir|unlink|shred)$/.test(path.basename(words[i + 1] ?? '')))
    if (deletes) {
      const paths = []
      for (const w of words.slice(1)) {
        if (w.startsWith('-') || w === '!' || w === '(') break
        paths.push(w)
      }
      checkDocsTargets(paths.length ? paths : ['.'], cwd, 'find -delete')
    }
  }
}

// ---------- guard files ----------

const GUARD_FILES_REASON =
  'changing .claude/settings.json, .claude/settings.local.json or files in .claude/hooks/ is not allowed for Claude: they hold the guard rules. Ask the user to change the file by hand.'

function guardPaths(cwd) {
  return projectRoots(cwd).flatMap((root) => [
    path.join(root, '.claude', 'settings.json'),
    path.join(root, '.claude', 'settings.local.json'),
    path.join(root, '.claude', 'hooks'),
  ])
}

// True when changing `target` could change a guard file: it is one, is inside .claude/hooks/,
// is a parent of one, or is a glob that can match one of those. Words with spaces are text.
function hitsGuardFiles(target, cwd) {
  if (target === '' || /\s/.test(target)) return false
  const abs = path.resolve(cwd, target.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'))
  return guardPaths(cwd).some((p) => hitsDocs(abs, p))
}

function checkGuardTargets(targets, cwd) {
  if (targets.some((t) => hitsGuardFiles(t, cwd))) block(GUARD_FILES_REASON)
}

const operands = (args) => args.filter((a) => !a.startsWith('-'))

// Commands that change every file they are given, and commands whose last operand is the
// destination (sources are only read). Deleting commands are covered by checkDocsTargets.
const CHANGES_EVERY_OPERAND = new Set(['mv', 'touch', 'truncate', 'chmod', 'chown', 'chgrp', 'tee', 'xattr', 'chflags'])
const CHANGES_LAST_OPERAND = new Set(['cp', 'install', 'ln', 'rsync', 'scp', 'ditto'])

function checkGuardFiles(words, outputs, cwd) {
  checkGuardTargets(outputs, cwd)
  if (!words.length) return
  const head = path.basename(words[0])
  const args = words.slice(1)
  if (CHANGES_EVERY_OPERAND.has(head)) checkGuardTargets(operands(args), cwd)
  if (CHANGES_LAST_OPERAND.has(head)) {
    const ops = operands(args)
    if (ops.length) checkGuardTargets([ops[ops.length - 1]], cwd)
    args.forEach((a, i) => {
      if ((a === '-t' || a === '--target-directory') && args[i + 1] !== undefined) checkGuardTargets([args[i + 1]], cwd)
      const eq = a.match(/^--target-directory=(.*)$/s)
      if (eq) checkGuardTargets([eq[1]], cwd)
    })
  }
  // In-place edits: sed -i, perl -i / -pi. The script word cannot name a guard file, so check all.
  if ((head === 'sed' || head === 'gsed') && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place')))
    checkGuardTargets(operands(args), cwd)
  if (head === 'perl' && args.some((a) => /^-[a-zA-Z]*i/.test(a))) checkGuardTargets(operands(args), cwd)
  if (head === 'dd') checkGuardTargets(args.filter((a) => a.startsWith('of=')).map((a) => a.slice(3)), cwd)
}

// git subcommands that overwrite or move working-tree files named as pathspecs.
function checkGitGuardFiles(sub, rest, dir) {
  if (['checkout', 'restore', 'mv'].includes(sub)) checkGuardTargets(operands(rest), dir)
}

// ---------- repo files changed from Bash (G19) ----------

const REPO_WRITE_REASON =
  'changing files in the repo with a script or a shell command is not allowed (G19). Use the Edit tool to change a file, or Write to create one.'
const CODE_WRITE_REASON =
  'inline code that writes a file is not allowed, wherever the file is (G19). Use the Edit tool to change a file, or Write to create one.'
const unresolvedReason = (w) =>
  `could not tell where "${w}" points, so it counts as a file in the repo (G19). Write the path in full, or use the Edit or Write tool.`
const outsideScriptReason = (f) =>
  `running the script file "${f}" from outside the repo is not allowed: a script written outside the repo can change files in it (G19). Use the Edit or Write tool; scripts in the repo and npm run are allowed.`

// Expand $NAME and ${NAME} with variables set earlier in the same command, and HOME, TMPDIR,
// PWD and CLAUDE_PROJECT_DIR. Returns null when a $ or a backtick is left that cannot be expanded.
function expandVars(word, vars, cwd) {
  const known = {
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR ?? tmpdir(),
    PWD: cwd,
    CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR ?? SCRIPT_ROOT,
  }
  let unresolved = false
  const out = word.replace(/\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g, (_m, braced, bare) => {
    const name = braced ?? bare
    const value = Object.hasOwn(vars, name) ? vars[name] : known[name]
    if (typeof value !== 'string') unresolved = true
    return value ?? ''
  })
  return unresolved || /[$`]/.test(out) ? null : out
}

// Remember NAME=value (and export NAME=value) when it is a command of its own; NAME=value cmd
// only sets the variable for cmd, after its words are expanded.
const ASSIGNMENT = /^([A-Za-z_]\w*)=(.*)$/s
function trackAssignments(raw, vars, cwd) {
  const w = raw[0] === 'export' ? raw.slice(1) : raw
  if (!w.length || !w.every((x) => ASSIGNMENT.test(x))) return
  for (const x of w) {
    const [, name, value] = x.match(ASSIGNMENT)
    vars[name] = expandVars(value, vars, cwd)
  }
}

function inRepo(target, cwd) {
  const abs = path.resolve(cwd, target.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'))
  return projectRoots(cwd).some((root) => contains(root, abs))
}

// Block when a file a command writes is in the repo, or cannot be resolved.
function checkWriteTargets(targets, cwd, vars) {
  for (const t of targets) {
    if (t === '') continue
    const p = expandVars(t, vars, cwd)
    if (p === null) block(unresolvedReason(t))
    if (inRepo(p, cwd)) block(REPO_WRITE_REASON)
  }
}

// Calls that write a file in Python, Node, Ruby and Perl code.
const CODE_WRITES = [
  /\bopen\s*\((?:[^,()\n]|\([^()\n]*\))+,\s*(?:mode\s*=\s*)?['"][rbtU]*[wax+][rbtU+]*['"]/, // open(p, 'w')
  /\bmode\s*=\s*['"][rbtU]*[wax+]/, // open(p, mode='w')
  /\bopen\s*\(?\s*(?:my\s+)?[$\w]+\s*,\s*['"]\s*(?:\+?>|\+<)/, // Perl open(my $f, '>', …)
  /\.write_(?:text|bytes)\s*\(/, // pathlib
  /\b(?:shutil\.(?:copy\w*|move)|os\.(?:rename|replace))\s*\(/,
  /\binplace\s*=\s*(?:True|1)\b/, // fileinput
  /\b(?:writeFile|appendFile|createWriteStream|copyFile|cpSync|renameSync|writeSync|truncateSync)/, // Node fs
  /\bfs\w*\.(?:rename|cp|truncate|write)\w*\s*\(/,
  /\b(?:File|IO)\.(?:write|binwrite)\b/, // Ruby
  /\bFileUtils\.(?:cp|mv|copy|move|install)\b/,
  /\b(?:file_put_contents|fwrite|fputs)\s*\(/, // PHP
  /\b(?:Bun\.write|Deno\.write\w*)\s*\(/,
]
const codeWrites = (code) => CODE_WRITES.some((re) => re.test(code))

// A here-document fed to one of these programs is code.
const CODE_RUNNER_OPENER = /(^|[|;&(]\s*)(sudo\s+)?((npx|bunx|pnpx)\s+)?(node|python[\d.]*|ruby|perl|php|tsx|ts-node|bun|deno)\b/

// Programs that run a script file, which must be in the repo. inline: flags after which there is
// no script file (inline code, a module, stdin); code: inline flags whose value is code; values:
// flags that take a value; file: flags whose value is the script file; subcommands: a first
// word that is skipped once (bun run file).
const NODE_LIKE = ['-e', '--eval', '-p', '--print']
const SHELL_RUNNER = { inline: ['-c', '-s'], code: [], values: ['-o', '-O', '+o', '+O', '--rcfile', '--init-file'] }
const SCRIPT_RUNNERS = {
  node: {
    inline: NODE_LIKE,
    code: NODE_LIKE,
    values: ['-r', '--require', '--import', '--loader', '--experimental-loader', '-C', '--conditions', '--env-file', '--input-type', '--title'],
  },
  python: { inline: ['-c', '-m'], code: ['-c'], values: ['-W', '-X'] },
  ruby: { inline: ['-e'], code: ['-e'], values: ['-I', '-r', '-C', '-E'] },
  perl: { inline: ['-e', '-E'], code: ['-e', '-E'], values: ['-I', '-M', '-m'] },
  php: { inline: ['-r', '-a'], code: ['-r'], values: ['-d', '-c', '-z'], file: ['-f'] },
  tsx: { inline: NODE_LIKE, code: NODE_LIKE, values: ['--tsconfig', '--env-file', '-r', '--require', '--import'], subcommands: ['watch'] },
  'ts-node': {
    inline: NODE_LIKE,
    code: NODE_LIKE,
    values: ['-P', '--project', '-r', '--require', '-C', '--compiler', '-O', '--compiler-options'],
  },
  bun: { inline: NODE_LIKE, code: NODE_LIKE, values: ['--cwd', '--config', '-r', '--preload'], subcommands: ['run', 'test'] },
  deno: {
    inline: [],
    code: [],
    values: ['-c', '--config', '--import-map', '--env-file', '--location'],
    subcommands: ['run', 'test', 'bench', 'serve', 'compile'],
  },
  source: { inline: [], code: [], values: [] },
}
for (const sh of ['bash', 'sh', 'zsh', 'dash', 'ksh']) SCRIPT_RUNNERS[sh] = SHELL_RUNNER
SCRIPT_RUNNERS['.'] = SCRIPT_RUNNERS.source

function scriptRunner(head) {
  if (/^python(\d+(\.\d+)*)?$/.test(head)) return SCRIPT_RUNNERS.python
  return Object.hasOwn(SCRIPT_RUNNERS, head) ? SCRIPT_RUNNERS[head] : null
}

// The index in args of the script file a runner runs, or -1 for inline code, a module, stdin or
// no script.
function scriptIndex(runner, args) {
  let subSkipped = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') return i + 1 < args.length ? i + 1 : -1
    if (a === '-' || runner.inline.includes(a)) return -1
    if (runner === SCRIPT_RUNNERS.perl && /^-[a-zA-Z0-9]*[eE]$/.test(a)) return -1 // -ne, -pe
    if (runner.file?.includes(a)) return i + 1 < args.length ? i + 1 : -1
    if (runner.values.includes(a)) i++
    else if (!a.startsWith('-') && !a.startsWith('+')) {
      if (!subSkipped && runner.subcommands?.includes(a)) subSkipped = true
      else return i
    }
  }
  return -1
}

// Package runners: npx tsx file, npm exec tsx file, pnpm tsx file, yarn tsx file, bun x tsx file.
// 1: the first word is the program; 2: only after dlx/exec/x, or when the first word is a runner.
const PACKAGE_RUNNERS = { npx: 1, bunx: 1, pnpx: 1, pnpm: 2, yarn: 2, npm: 2, bun: 2 }
const PACKAGE_VALUE_FLAGS = ['-p', '--package', '-c', '--call', '-w', '--workspace', '--filter', '-C', '--dir', '--cwd', '--prefix']
const packageName = (p) => p.replace(/(?<=.)@[^/@]*$/, '') // tsx@4 → tsx

function skipPackageOptions(rest, i) {
  while (i < rest.length && rest[i].startsWith('-')) i += PACKAGE_VALUE_FLAGS.includes(rest[i]) ? 2 : 1
  return i
}

// The words of the program a package runner starts, or null.
function packageCommand(words) {
  const head = path.basename(words[0])
  if (!Object.hasOwn(PACKAGE_RUNNERS, head)) return null
  const rest = words.slice(1)
  let i = skipPackageOptions(rest, 0)
  if (PACKAGE_RUNNERS[head] === 2) {
    if (['dlx', 'exec', 'x'].includes(rest[i])) i = skipPackageOptions(rest, i + 1)
    else if (rest[i] === undefined || !scriptRunner(packageName(rest[i]))) return null
  }
  return i < rest.length ? [packageName(rest[i]), ...rest.slice(i + 1)] : null
}

// System folders only root can write to: programs run from there by path are not scripts Claude wrote.
const SYSTEM_DIRS = ['/bin', '/sbin', '/usr/bin', '/usr/sbin', '/usr/libexec', '/System']

function checkScriptPath(file, cwd, vars, allowSystem) {
  const p = expandVars(file, vars, cwd)
  if (p === null) block(unresolvedReason(file))
  const abs = path.resolve(cwd, p.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'))
  if (allowSystem && SYSTEM_DIRS.some((d) => contains(d, abs))) return
  if (!inRepo(p, cwd)) block(outsideScriptReason(file))
}

// Block a script file run from outside the repo, and inline code that writes a file.
function checkScriptRun(words, cwd, vars, depth = 0) {
  if (!words.length || depth > 5) return
  const pkg = packageCommand(words)
  if (pkg) return checkScriptRun(pkg, cwd, vars, depth + 1)
  // A program named by a path (/tmp/fix.sh, ./fix.py) runs that file.
  if (words[0].includes('/')) checkScriptPath(words[0], cwd, vars, true)
  const runner = scriptRunner(path.basename(words[0]))
  if (!runner) return
  const args = words.slice(1)
  args.forEach((a, i) => {
    const isCode = runner.code.includes(a) || (runner === SCRIPT_RUNNERS.perl && /^-[a-zA-Z0-9]*[eE]$/.test(a))
    if (isCode && args[i + 1] !== undefined && codeWrites(args[i + 1])) block(CODE_WRITE_REASON)
  })
  if (runner === SCRIPT_RUNNERS.deno && operands(args)[0] === 'eval' && args.some(codeWrites)) block(CODE_WRITE_REASON)
  const i = scriptIndex(runner, args)
  if (i === -1) return
  // bun run tsx file: the script file is given to another runner.
  if (!args[i].includes('/') && scriptRunner(args[i])) return checkScriptRun(args.slice(i), cwd, vars, depth + 1)
  checkScriptPath(args[i], cwd, vars, false)
}

// sed / perl -i: the files given, without the script (first operand when no -e is given).
function inPlaceFiles(args, scriptFlag, valueFlags) {
  const files = []
  let scriptGiven = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (scriptFlag(a)) {
      scriptGiven = true
      i++
    } else if (valueFlags.includes(a)) i++
    else if (a !== '' && !a.startsWith('-')) files.push(a)
  }
  return scriptGiven ? files : files.slice(1)
}

function checkRepoWrites(words, outputs, cwd, vars) {
  checkWriteTargets(outputs, cwd, vars)
  if (!words.length) return
  const head = path.basename(words[0])
  const args = words.slice(1)
  checkScriptRun(words, cwd, vars)
  if (head === 'find') {
    // find … -exec cmd {} \; runs cmd on each file found.
    args.forEach((a, i) => {
      if (!['-exec', '-execdir', '-ok', '-okdir'].includes(a)) return
      const end = args.findIndex((x, j) => j > i && (x === ';' || x === '+'))
      checkRepoWrites(stripPrefixes(args.slice(i + 1, end === -1 ? undefined : end)), [], cwd, vars)
    })
  }
  if (head === 'tee') checkWriteTargets(operands(args), cwd, vars)
  if (head === 'dd') checkWriteTargets(args.filter((a) => a.startsWith('of=')).map((a) => a.slice(3)), cwd, vars)
  if (head === 'truncate') checkWriteTargets(args.filter((a, i) => !a.startsWith('-') && !['-s', '-r'].includes(args[i - 1])), cwd, vars)
  if ((head === 'sed' || head === 'gsed') && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) {
    const files = inPlaceFiles(args, (a) => ['-e', '--expression', '-f', '--file'].includes(a), [])
    checkWriteTargets(files.length ? files : ['__stdin__'], cwd, vars)
  }
  if (head === 'perl' && args.some((a) => /^-[a-zA-Z0-9]*i/.test(a))) {
    const files = inPlaceFiles(args, (a) => /^-[a-zA-Z0-9]*[eE]$/.test(a), ['-I', '-M', '-m'])
    checkWriteTargets(files.length ? files : ['__stdin__'], cwd, vars)
  }
  if (['cp', 'install', 'rsync'].includes(head)) {
    let dirGiven = false
    args.forEach((a, i) => {
      const eq = a.match(/^--target-directory=(.*)$/s)
      const dir = a === '-t' || a === '--target-directory' ? args[i + 1] : eq?.[1]
      if (dir !== undefined) {
        dirGiven = true
        checkWriteTargets([dir], cwd, vars)
      }
    })
    const ops = operands(args)
    if (!dirGiven && ops.length > 1) checkWriteTargets([ops[ops.length - 1]], cwd, vars)
  }
  if (head === 'patch' && !args.some((a) => a === '--dry-run' || a === '--check')) {
    const d = args.findIndex((a) => a === '-d' || a === '--directory')
    checkWriteTargets([d !== -1 && args[d + 1] !== undefined ? args[d + 1] : '.', ...operands(args)], cwd, vars)
  }
  if (head === 'npm') {
    const ops = operands(args)
    if (ops[0] === 'pkg' && ops[1] === 'set') checkWriteTargets(['package.json'], cwd, vars)
  }
}

// git apply changes the working tree (or the index with --cached); --check, --stat, --numstat
// and --summary only read the patch, unless --apply is also given.
function checkGitApply(rest, dir) {
  const readOnly = rest.some((a) => ['--check', '--stat', '--numstat', '--summary'].includes(a)) && !rest.includes('--apply')
  if (!readOnly) checkWriteTargets(['.'], dir, {})
}

// ---------- Bash ----------

function checkShell(source, cwd, depth = 0) {
  if (depth > 5) block('command nesting is too deep to check; failing closed.')
  const { text: command, bodies } = splitHeredocs(source)
  for (const { opener, body, quoted } of bodies) {
    if (SHELL_OPENER.test(opener)) checkShell(body, cwd, depth + 1)
    else if (CODE_OPENER.test(opener)) {
      // In an unquoted here-document the shell runs $(…) and `…` first: check the whole body.
      const expands = !quoted && /\$\(|`/.test(body)
      if (expands ? ENV_IN_CODE.test(body) : codeNamesEnv(body)) block(ENV_REASON)
    }
    if (!SHELL_OPENER.test(opener) && CODE_RUNNER_OPENER.test(opener) && codeWrites(body)) block(CODE_WRITE_REASON)
  }
  for (const inner of substitutions(command)) checkShell(inner, cwd, depth + 1)
  const vars = {}
  for (const { words: raw, redirects, outputs } of splitCommands(command)) {
    trackAssignments(raw, vars, cwd)
    const words = stripPrefixes(raw)
    checkGuardFiles(words, outputs, cwd)
    if (!words.length) {
      if (redirects.some(wordNamesEnv)) block(ENV_REASON)
      checkRepoWrites(words, outputs, cwd, vars)
      continue
    }
    checkEnvFiles(words, redirects)
    checkRepoWrites(words, outputs, cwd, vars)
    const head = path.basename(words[0])
    if (head === 'cd' || head === 'pushd') {
      // Follow "cd dir && rm ..." so relative paths resolve where the shell will be.
      const dir = words.slice(1).find((w) => !w.startsWith('-'))
      cwd = dir ? path.resolve(cwd, dir.replace(/^~(?=$|\/)/, process.env.HOME ?? '~')) : (process.env.HOME ?? cwd)
      continue
    }
    if (['bash', 'sh', 'zsh', 'dash', 'ksh'].includes(head)) {
      const c = words.indexOf('-c')
      if (c !== -1 && words[c + 1] !== undefined) checkShell(words[c + 1], cwd, depth + 1)
    }
    if (head === 'eval') checkShell(words.slice(1).join(' '), cwd, depth + 1)
    if (head === 'xargs') {
      const rest = words.slice(1)
      while (rest.length && rest[0].startsWith('-')) rest.shift()
      if (rest.length) checkShell(rest.join(' ') + ' __xargs_input__', cwd, depth + 1)
    }
    if (head === 'git') checkGit(words, cwd)
    if (head === 'gh') checkGh(words)
    const v = vercelArgs(words)
    if (v) checkVercel(v)
    checkDelete(words, cwd)
  }
}

// ---------- tools ----------

const FILE_TOOLS = { Read: 'file_path', Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' }

function check(input) {
  const { tool_name: tool, tool_input: ti, cwd } = input
  if (tool === 'Bash') {
    checkShell(requireString(ti, 'command', 'Bash tool_input'), cwd)
    return
  }
  if (tool in FILE_TOOLS) {
    const file = requireString(ti, FILE_TOOLS[tool], `${tool} tool_input`)
    if (isEnvName(file)) block(ENV_REASON)
    if (tool !== 'Read' && hitsGuardFiles(file, cwd)) block(GUARD_FILES_REASON)
    return
  }
  if (tool === 'Grep') {
    requireString(ti, 'pattern', 'Grep tool_input')
    for (const key of ['path', 'glob']) {
      if (ti[key] !== undefined && typeof ti[key] !== 'string') block(`Grep tool_input "${key}" is not a string; failing closed.`)
      if (ti[key] && isEnvName(ti[key])) block(ENV_REASON)
    }
    return
  }
  if (tool === 'Glob') {
    if (isEnvName(requireString(ti, 'pattern', 'Glob tool_input'))) block(ENV_REASON)
    if (ti.path !== undefined && typeof ti.path !== 'string') block('Glob tool_input "path" is not a string; failing closed.')
    if (ti.path && isEnvName(ti.path)) block(ENV_REASON)
    return
  }
  if (tool === 'mcp__github__merge_pull_request') {
    block('merging pull requests is not allowed for Claude. The user merges PRs on GitHub.')
  }
  block(`the guard has no rule for tool "${tool}"; failing closed. Update .claude/hooks/guard.mjs and the matcher together.`)
}

try {
  check(readInput())
  process.exit(0)
} catch (err) {
  fail(err instanceof Block ? err.message : `guard crashed (${err?.message ?? err}); failing closed.`)
}
