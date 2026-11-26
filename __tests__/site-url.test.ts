import { describe, expect, it } from 'vitest'
import { siteUrl } from '@/server/site-url'

const LOCAL = 'http://localhost:3000/'
const BRANCH = 'lunch-app-git-feat-x-nguyet-tran.vercel.app'
const PRODUCTION = 'lunch.example'

describe('B64 the site address of the email links and the Google callback', () => {
  it('a Vercel preview uses its branch URL with https, and ignores NEXT_PUBLIC_SITE_URL', () => {
    const env = { VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: BRANCH, VERCEL_URL: 'lunch-app-abc123.vercel.app', NEXT_PUBLIC_SITE_URL: LOCAL }
    expect(siteUrl(env)).toBe(`https://${BRANCH}`)
  })

  it('production uses the project production domain with https, not the branch URL', () => {
    const env = {
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: PRODUCTION,
      VERCEL_BRANCH_URL: 'lunch-app-git-main-nguyet-tran.vercel.app',
    }
    expect(siteUrl(env)).toBe(`https://${PRODUCTION}`)
  })

  it('off Vercel, and with `vercel dev`, uses NEXT_PUBLIC_SITE_URL without its trailing slash', () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: LOCAL })).toBe('http://localhost:3000')
    expect(siteUrl({ VERCEL_ENV: 'development', NEXT_PUBLIC_SITE_URL: LOCAL, VERCEL_BRANCH_URL: BRANCH })).toBe('http://localhost:3000')
  })

  it('keeps a single https and no trailing slash if Vercel ever gives one', () => {
    expect(siteUrl({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: `https://${BRANCH}/` })).toBe(`https://${BRANCH}`)
  })

  it('says which variable is missing instead of building a broken link', () => {
    expect(() => siteUrl({ VERCEL_ENV: 'preview', NEXT_PUBLIC_SITE_URL: LOCAL })).toThrow(/VERCEL_BRANCH_URL is not set/)
    expect(() => siteUrl({ VERCEL_ENV: 'production' })).toThrow(/VERCEL_PROJECT_PRODUCTION_URL is not set/)
    expect(() => siteUrl({})).toThrow(/NEXT_PUBLIC_SITE_URL is not set/)
  })
})
