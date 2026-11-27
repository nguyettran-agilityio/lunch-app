// @vitest-environment node
// Checks the decision tables in docs/decisions.md (see decisions X3, X4 and X8).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FILE = path.resolve(__dirname, '..', 'docs', 'decisions.md')

type Row = { line: number; id: string; why: string; source: string; section: string }

// Table rows whose first cell is a decision ID such as T1 or G10. Escaped pipes (\|) stay inside a cell.
function parseRows(markdown: string): Row[] {
  const rows: Row[] = []
  let section = ''
  markdown.split('\n').forEach((text, i) => {
    const heading = text.match(/^## (.+)$/)
    if (heading) section = heading[1].trim()
    if (!text.startsWith('|')) return
    const cells = text
      .replace(/^\|/, '')
      .replace(/\|\s*$/, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.trim())
    if (!/^[A-Z]+\d+$/.test(cells[0] ?? '')) return
    rows.push({ line: i + 1, id: cells[0], why: cells[3] ?? '', source: cells[4] ?? '', section })
  })
  return rows
}

// IDs must be unique, and each prefix must be numbered 1..n with no gaps.
function idProblems(rows: Row[]): string[] {
  const problems: string[] = []
  const seen = new Map<string, number>()
  const byPrefix = new Map<string, number[]>()
  for (const r of rows) {
    if (seen.has(r.id)) problems.push(`${r.id} on line ${r.line} duplicates line ${seen.get(r.id)}`)
    else seen.set(r.id, r.line)
    const [, prefix, num] = r.id.match(/^([A-Z]+)(\d+)$/)!
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), Number(num)])
  }
  for (const [prefix, nums] of byPrefix) {
    nums.forEach((n, i) => {
      if (n !== i + 1) problems.push(`${prefix}${n} is in position ${i + 1}; expected ${prefix}${i + 1}`)
    })
  }
  return problems
}

// Every row needs a Source; a "User decision" row needs the user's words quoted in it.
function sourceProblems(rows: Row[]): string[] {
  const problems: string[] = []
  for (const r of rows) {
    if (r.source === '') problems.push(`${r.id} on line ${r.line} has no Source`)
    else if (/^User decision/.test(r.why) && !/\buser: "/i.test(r.source))
      problems.push(`${r.id} on line ${r.line} is a user decision but its Source quotes no user words`)
  }
  return problems
}

// From the "Build" section on, every Why says who made the decision (X8).
function ownerProblems(rows: Row[]): string[] {
  const start = rows.findIndex((r) => r.section === 'Build')
  if (start === -1) return []
  return (
    rows
      .slice(start)
      // "Claude's choice": picked by Claude while coding or reviewing and listed in the PR for the Lead (G23, since PR M2-2).
      .filter((r) => !/^(User decision|Proposed by Claude|Claude's choice)/.test(r.why))
      .map((r) => `${r.id} on line ${r.line} does not say whether it is a user decision or proposed by Claude`)
  )
}

const header = '| # | Topic | Decision | Why | Source |\n|---|---|---|---|---|\n'

describe('docs/decisions.md', () => {
  const rows = parseRows(readFileSync(FILE, 'utf8'))

  it('has decision rows', () => {
    expect(rows.length).toBeGreaterThan(0)
  })

  it('has unique IDs numbered 1..n per prefix', () => {
    expect(idProblems(rows)).toEqual([])
  })

  it('gives every decision a Source, with the user words for user decisions', () => {
    expect(sourceProblems(rows)).toEqual([])
  })

  it('says who made each decision from the Build section on', () => {
    expect(ownerProblems(rows)).toEqual([])
  })
})

describe('decision checks catch mistakes', () => {
  it('reports a duplicate ID', () => {
    const rows = parseRows(header + '| G1 | a | b | c | #1 |\n| G1 | a | b | c | #2 |\n')
    expect(idProblems(rows)).toContain('G1 on line 4 duplicates line 3')
  })

  it('reports a gap in the numbering', () => {
    const rows = parseRows(header + '| T1 | a | b | c | #1 |\n| T3 | a | b | c | #2 |\n')
    expect(idProblems(rows)).toEqual(['T3 is in position 2; expected T2'])
  })

  it('reports a missing Source', () => {
    const rows = parseRows(header + '| C1 | a | b | c |  |\n')
    expect(sourceProblems(rows)).toEqual(['C1 on line 3 has no Source'])
  })

  it('reports a user decision without the user words', () => {
    const rows = parseRows(header + '| X1 | a | b | User decision | #4 |\n')
    expect(sourceProblems(rows)).toEqual(['X1 on line 3 is a user decision but its Source quotes no user words'])
  })

  it('accepts a user decision with the user words and keeps escaped pipes in a cell', () => {
    const rows = parseRows(header + '| X1 | a | b \\| c | User decision | #3; user: "Yes" |\n')
    expect(rows[0].source).toBe('#3; user: "Yes"')
    expect(sourceProblems(rows)).toEqual([])
  })

  it('reports a Build decision that does not say who made it', () => {
    const md =
      '## Git\n\n' +
      header +
      '| G1 | a | b | c | #1 |\n\n## Build\n\n' +
      header +
      '| B1 | a | b | User decision | user: "Yes" |\n| B2 | a | b | Proposed by Claude, approved | user: "Ok" |\n| B3 | a | b | Faster | #2 |\n'
    expect(ownerProblems(parseRows(md))).toEqual(['B3 on line 13 does not say whether it is a user decision or proposed by Claude'])
  })

  it("accepts a Claude's choice of G23", () => {
    const md = '## Build\n\n' + header + "| B1 | a | b | Claude's choice, listed in the PR | other options |\n"
    expect(ownerProblems(parseRows(md))).toEqual([])
  })
})
