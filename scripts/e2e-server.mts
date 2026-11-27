// The server of `npm run test:e2e` (plan.md section 4, B25, B43, B44, B47), started by
// Playwright as its webServer: an in-memory PGlite served over TCP by pglite-socket, the
// migrations of drizzle/ (the same files `npm run db:migrate` applies), the test-only
// tables of e2e/test-tables.sql, the seeded accounts, then `next start` on the existing
// build in the test sign-in mode. Needs no secret and no Supabase.
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { spawn } from 'node:child_process'
import { seedTestData } from '../e2e/seed.ts'
import { TEST_ACCOUNTS, TEST_GOOGLE_SHOP_EMAIL } from '../src/server/auth/test-accounts.ts'

const DB_PORT = Number(process.env.E2E_DB_PORT ?? 54329)
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100)

const pg = await PGlite.create()
await migrate(drizzle(pg), { migrationsFolder: 'drizzle' })
await seedTestData(pg)

// `next start` opens a few connections; the server queues their queries on the one PGlite.
const db = new PGLiteSocketServer({ db: pg, port: DB_PORT, host: '127.0.0.1', maxConnections: 10 })
await db.start()
console.log(`PGlite on 127.0.0.1:${DB_PORT}, migrations applied, test accounts seeded`)

const app = spawn('npx', ['next', 'start', '--port', String(APP_PORT)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    // NODE_ENV=test keeps Next from loading .env.local, so a developer's Supabase keys
    // there never reach the test server (instrumentation.ts would refuse them anyway).
    NODE_ENV: 'test',
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`,
    E2E_TEST_AUTH: '1',
    SHOP_EMAILS: `${TEST_ACCOUNTS.shop.email},${TEST_GOOGLE_SHOP_EMAIL},${TEST_ACCOUNTS.resetShop.email}`,
  },
})

let stopping = false
async function stop(code: number) {
  if (stopping) return
  stopping = true
  app.kill('SIGTERM')
  await db.stop()
  await pg.close()
  process.exit(code)
}
app.on('exit', (code) => void stop(code ?? 1))
process.on('SIGINT', () => void stop(0))
process.on('SIGTERM', () => void stop(0))
