// The test version of the StorageProvider (B71): files in the table `test_files` of the test sign-in
// mode, uploaded with `PUT /test/files?path=…` and shown by `GET /test/files?path=…`, routes that
// answer 404 when the mode is off (B46). The signed addresses carry no token: only the test mode has them.
import 'server-only'
import { eq, inArray } from 'drizzle-orm'
import { testFiles } from '@/server/auth/test-tables'
import { getDb } from '@/server/db/client'
import type { StorageProvider } from './provider'

const fileUrl = (path: string) => `/test/files?path=${encodeURIComponent(path)}`

export const testStorage: StorageProvider = {
  async uploadUrl(path) {
    return fileUrl(path)
  },
  async info(path) {
    const [f] = await getDb()
      .select({ size: testFiles.size, contentType: testFiles.contentType })
      .from(testFiles)
      .where(eq(testFiles.path, path))
    return f ?? null
  },
  async readUrls(paths) {
    return new Map(paths.map((p) => [p, fileUrl(p)]))
  },
  async remove(paths) {
    if (paths.length) await getDb().delete(testFiles).where(inArray(testFiles.path, paths))
  },
}
