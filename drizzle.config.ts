// drizzle-kit settings: `npm run db:generate` writes migrations into drizzle/ (B13).
// Migrations are applied by `npm run db:migrate` (scripts/migrate.mts), not by drizzle-kit.
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
})
