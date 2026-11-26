// @vitest-environment node
// Every acceptance criterion in docs/spec.md needs an automated test (see decision X7).
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..')
const TESTS = path.join(ROOT, '__tests__')

// Acceptance criteria with no automated test on purpose, each with its reason.
// These exceptions hold for the prototype only (decision X7): in the Code step every
// acceptance criterion must have a test, and this list must be emptied.
const NO_AUTOMATED_TEST: Record<string, string> = {
  AC13: 'Closing a day is not in the prototype (P1, P2); built in milestone M5 of docs/plan.md',
  AC15: 'Dish management is not in the prototype; dishes are fixed fake data (P2); built in milestone M4 of docs/plan.md',
  AC16: 'Sign-in and profile completion are not in the prototype (P1); built in milestone M3 of docs/plan.md',
  AC19: 'Layout on phone and computer: the Playwright layout test (B11) is completed in milestone M6 of docs/plan.md, when every screen is in it; since PR M1-1c it runs on the /proto screens (B28, e2e/layout.spec.ts)',
  AC20: 'Forgot password is not in the prototype (P1); built in milestone M1 of docs/plan.md',
  AC49: 'Sign-up and sign-in details (CN-58) are not in the prototype (P1); built in milestone M1 of docs/plan.md',
  AC53: 'The sign-up part is tested since PR M1-2 (scenario A10); the reset part comes with Forgot password in PR M1-4 of docs/plan.md',
  AC54: 'Sign-up and sign-in details (CN-58) are not in the prototype (P1); built in milestone M1 of docs/plan.md',
  AC55: 'Sign-up and sign-in details (CN-58) are not in the prototype (P1); built in milestone M5 of docs/plan.md',
  AC56: 'Sign-up and sign-in details (CN-58) are not in the prototype (P1); built in milestone M1 of docs/plan.md',
  AC57: 'Sign-up and sign-in details (CN-58) are not in the prototype (P1); built in milestone M3 of docs/plan.md',
  AC58: 'Dish photos and drawings picked by the shop (CN-59) need dish management, not in the prototype (P2); built in milestone M2 of docs/plan.md',
  AC59: 'Shop price changes (CN-59) need dish management, not in the prototype (P2); built in milestone M3 of docs/plan.md',
  AC60: 'Taking a dish off a menu (CN-59) needs day management, not in the prototype (P2); built in milestone M3 of docs/plan.md',
  AC61: 'Several shop accounts (CN-59) need sign-in, not in the prototype (P1); built in milestone M4 of docs/plan.md',
  AC62: 'Two people acting at once (CN-59) needs a server, not in the prototype (P1); built in milestone M5 of docs/plan.md',
  AC63: 'Deactivating a dish (CN-60) needs dish management, not in the prototype (P2); built in milestone M3 of docs/plan.md',
  AC64: 'Price changes during an edit (CN-60) need dish management, not in the prototype (P2); built in milestone M4 of docs/plan.md',
  AC65: 'Price changes while placing (CN-60) need dish management, not in the prototype (P2); built in milestone M3 of docs/plan.md',
  AC66: 'Two devices of one customer (CN-60) need a server, not in the prototype (P1); built in milestone M4 of docs/plan.md',
  AC69: 'The sign-in part is tested since PR M1-2 (scenario P8); the "Forgot password" part comes in PR M1-4 of docs/plan.md',
  AC70: 'Profile email changes (CN-60) are not in the prototype (P1); built in milestone M1 of docs/plan.md',
  AC72: 'Phone display on the profile and the real delivery list (CN-60) needs sign-in, not in the prototype (P1); built in milestone M5 of docs/plan.md',
  AC73: 'Build-your-own rules screen (CN-60) is not in the prototype (P2); built in milestone M2 of docs/plan.md',
  AC74: 'Photo uploads to storage (CN-60) need a server, not in the prototype (P1); built in milestone M4 of docs/plan.md',
  AC75: 'Settings screen (CN-60) is not in the prototype (P2); built in milestone M3 of docs/plan.md',
  AC76: 'The sign-up form is tested since PR M1-2 (scenario P15); the profile asked after confirming comes in PR M1-5 of docs/plan.md',
  AC77: 'Dishes screen checks (CN-61) need dish management, not in the prototype (P2); built in milestone M2 of docs/plan.md',
  AC78: 'Plate rule changes (CN-61) need the rules screen, not in the prototype (P2); built in milestone M3 of docs/plan.md',
  AC79: 'Default cutoff changes (CN-61) need the settings screen, not in the prototype (P2); built in milestone M3 of docs/plan.md',
  AC80: 'Bank changes (CN-61) need the settings screen, not in the prototype (P2); built in milestone M3 of docs/plan.md',
  AC82: 'A declined default building (CN-61) needs the profile, not in the prototype (P1); built in milestone M4 of docs/plan.md',
  AC84: 'The expired confirmation link is tested since PR M1-2 (scenario Q8); the expired reset link comes in PR M1-4 of docs/plan.md',
  AC85: 'The refund QR part is tested in the prototype (BR-29b); dish photos and storage need a server, not in the prototype (P1, P2); built in milestone M4 of docs/plan.md',
  AC86: 'Price changes during an edit (CN-62) need dish management, not in the prototype (P2); built in milestone M4 of docs/plan.md',
  AC87: 'Plate rule changes (CN-62) need the rules screen, not in the prototype (P2); built in milestone M4 of docs/plan.md',
  AC88: 'Cutoff changes (CN-62) need the days and settings screens, not in the prototype (P2); built in milestone M3 of docs/plan.md',
  AC89: 'Day menu changes (CN-62) need the days screen, not in the prototype (P2); built in milestone M5 of docs/plan.md',
  AC91: 'Google sign-in (CN-62) is not in the prototype (P1); built in milestone M1 of docs/plan.md',
  AC92: 'Profile phone checks (CN-63) are not in the prototype (P1); built in milestone M1 of docs/plan.md',
  AC94: 'Google sign-in recovery (CN-63) is not in the prototype (P1); built in milestone M1 of docs/plan.md',
  AC95: 'Sign-in from the home page is tested since PR M1-2 (scenario X1); the profile page comes in PR M1-5 of docs/plan.md',
  AC97: 'The link signing in is tested since PR M1-2 (scenario X3, it opens / until then); the profile page comes in PR M1-5 of docs/plan.md',
  AC100: 'Password reset is not in the prototype (P1) (CN-64); built in milestone M1 of docs/plan.md',
  AC101: 'Profile email changes are not in the prototype (P1) (CN-64); built in milestone M1 of docs/plan.md',
  AC103: 'Profile completion is not in the prototype (P1) (CN-64); built in milestone M1 of docs/plan.md',
  AC105: 'Expired links are not in the prototype (P1) (CN-65); built in milestone M1 of docs/plan.md',
  AC106: 'Profile email changes are not in the prototype (P1) (CN-65); built in milestone M1 of docs/plan.md',
  AC107: 'The shop part is tested since PR M1-2 (scenario X14); the profile first comes in PR M1-5 of docs/plan.md',
  AC109: 'Expired links are not in the prototype (P1) (CN-65); built in milestone M1 of docs/plan.md',
  AC110: 'Google sign-in is not in the prototype (P1) (CN-65); built in milestone M1 of docs/plan.md',
  AC111: 'Waiting emails are not in the prototype (P1) (CN-66); built in milestone M1 of docs/plan.md',
  AC113: 'Account emails are not in the prototype (P1) (CN-67); built in milestone M1 of docs/plan.md',
  AC124: 'Shop accounts at sign-in are not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC125: 'Expired links are not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC126: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC127: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC128: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC129: 'Shop accounts at sign-in are not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC130: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC131: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC132: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC133: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC134: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC135: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC136: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC137: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC138: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC139: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
  AC140: 'Google sign-in is not in the prototype (P1) (CN-72); built in PR M1-3 of docs/plan.md',
}

type Criterion = { id: string; cited: string[] }

// Rows of the acceptance criteria table, with the CN ids each row cites in brackets.
function parseCriteria(spec: string): Criterion[] {
  return spec
    .split('\n')
    .map((line) => line.match(/^\|\s*(AC\d+)\s*\|(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ id: m[1], cited: [...m[2].matchAll(/CN-\d+/g)].map((c) => c[0]) }))
}

// Names of every test(...), it(...) and describe(...) in the test files.
function testNames(sources: string[]): string[] {
  const names: string[] = []
  for (const src of sources) {
    for (const m of src.matchAll(/\b(?:test|it|describe)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) names.push(m[2])
  }
  return names
}

const hasId = (name: string, id: string) => new RegExp(`(?<![\\w-])${id}(?![\\w-])`).test(name)

// A criterion is covered when a test name gives its AC id or one of the CN ids it cites.
function uncovered(criteria: Criterion[], names: string[]): string[] {
  return criteria.filter((c) => ![c.id, ...c.cited].some((id) => names.some((n) => hasId(n, id)))).map((c) => c.id)
}

describe('parsing', () => {
  it('reads AC rows and the CN ids they cite', () => {
    const spec = '| AC1 | a | b | c |\n| AC2 | x | y | z [CN-48] [CN-49] |\n| Not | a row |\n- AC3 in text'
    expect(parseCriteria(spec)).toEqual([
      { id: 'AC1', cited: [] },
      { id: 'AC2', cited: ['CN-48', 'CN-49'] },
    ])
  })

  it('reads test names in any quote style', () => {
    const src = `test('AC1: one', () => {})\n  it("CN-2 two", () => {})\ndescribe(\`AC3 \${x}\`, () => {})`
    expect(testNames([src])).toEqual(['AC1: one', 'CN-2 two', 'AC3 ${x}'])
  })

  it('matches whole ids only', () => {
    const criteria = [
      { id: 'AC1', cited: [] },
      { id: 'AC4', cited: ['CN-5'] },
      { id: 'AC6', cited: [] },
    ]
    expect(uncovered(criteria, ['AC10 and AC11', 'CN-5: rule', 'see (AC6)'])).toEqual(['AC1'])
  })
})

describe('docs/spec.md acceptance criteria', () => {
  const criteria = parseCriteria(readFileSync(path.join(ROOT, 'docs', 'spec.md'), 'utf8'))
  // Vitest files and the Playwright tests of e2e/, with one rule for both (B56).
  const E2E = path.join(ROOT, 'e2e')
  const sources = [
    ...readdirSync(TESTS)
      .filter((f) => /\.test\.tsx?$/.test(f) && f !== 'spec-coverage.test.ts')
      .map((f) => readFileSync(path.join(TESTS, f), 'utf8')),
    ...readdirSync(E2E)
      .filter((f) => /\.spec\.ts$/.test(f))
      .map((f) => readFileSync(path.join(E2E, f), 'utf8')),
  ]
  const missing = uncovered(criteria, testNames(sources))

  it('finds the acceptance criteria', () => {
    expect(criteria.length).toBeGreaterThan(0)
  })

  it('has a test for every acceptance criterion not listed as having none on purpose', () => {
    expect(missing.filter((id) => !(id in NO_AUTOMATED_TEST))).toEqual([])
  })

  it('lists only criteria that exist and still have no test', () => {
    const ids = new Set(criteria.map((c) => c.id))
    const stale = Object.keys(NO_AUTOMATED_TEST).filter((id) => !ids.has(id) || !missing.includes(id))
    expect(stale).toEqual([])
  })
})
