/**
 * This site's address, without a trailing slash (B64), for the links in account emails and the
 * Google callback. On Vercel it comes from Vercel's system variables, so no branch needs a variable
 * set by hand: a preview uses its branch URL (`VERCEL_BRANCH_URL`, the same for every push to the
 * branch, so a link emailed before a new push still opens), production the project's production
 * domain (`VERCEL_PROJECT_PRODUCTION_URL`). Vercel gives both without `https://`. Only off Vercel
 * (on the Lead's computer, `VERCEL_ENV` unset or `development`) is `NEXT_PUBLIC_SITE_URL` used.
 */
type Env = Partial<Record<string, string>>

export function siteUrl(env: Env = process.env): string {
  if (env.VERCEL_ENV === 'production') return vercelUrl(env, 'VERCEL_PROJECT_PRODUCTION_URL')
  if (env.VERCEL_ENV === 'preview') return vercelUrl(env, 'VERCEL_BRANCH_URL')
  const local = env.NEXT_PUBLIC_SITE_URL
  if (!local) throw new Error('NEXT_PUBLIC_SITE_URL is not set (plan.md section 3)')
  return local.replace(/\/+$/, '')
}

function vercelUrl(env: Env, name: 'VERCEL_PROJECT_PRODUCTION_URL' | 'VERCEL_BRANCH_URL'): string {
  const host = env[name]
  if (!host) throw new Error(`${name} is not set: turn on Vercel's system environment variables (plan.md section 3)`)
  return `https://${host.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
}
