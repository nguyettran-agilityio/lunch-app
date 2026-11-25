// `npm run db:migrate`: applies the migrations of drizzle/ to the database of DATABASE_URL
// (B13, B41). The Lead runs it against the preview project, and against production at the
// release; DATABASE_URL comes from the shell or from .env.local (read by Node's
// --env-file-if-exists in package.json). One connection, prepared statements off (B12).
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set (in the shell or in .env.local)')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
try {
  await migrate(drizzle(sql), { migrationsFolder: 'drizzle' })
  console.log('Migrations applied')
} finally {
  await sql.end()
}
