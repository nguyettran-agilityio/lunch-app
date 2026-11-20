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
  AC13: 'Closing a day is not in the prototype (P1, P2)',
  AC15: 'Dish management is not in the prototype; dishes are fixed fake data (P2)',
  AC16: 'Sign-in and profile completion are not in the prototype (P1)',
  AC19: 'Layout on phone and computer is checked by hand in the Browser pane at 375px and on desktop',
  AC20: 'Forgot password is not in the prototype (P1)',
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
  return criteria
    .filter((c) => ![c.id, ...c.cited].some((id) => names.some((n) => hasId(n, id))))
    .map((c) => c.id)
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
  const sources = readdirSync(TESTS)
    .filter((f) => /\.test\.tsx?$/.test(f) && f !== 'spec-coverage.test.ts')
    .map((f) => readFileSync(path.join(TESTS, f), 'utf8'))
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
