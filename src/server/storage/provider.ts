// The StorageProvider interface (B71, like the AuthProvider of B25): one interface with a
// Supabase version (the private bucket `dish-photos`, B15) and a test version (the table
// `test_files`, served at /test/files). Pages and Server Actions reach the files only through it.
import 'server-only'
import { isTestMode } from '@/server/auth/test-mode'

/** What the bucket knows about a file: its size in bytes and its type. */
export type FileInfo = { size: number; contentType: string }

export interface StorageProvider {
  /** An address the browser uploads one new file to with `PUT` (a signed upload URL). */
  uploadUrl(path: string): Promise<string>
  /** The file at `path`, or null when there is none. */
  info(path: string): Promise<FileInfo | null>
  /** Addresses that show the files for `seconds`, by path; a path that fails is left out. */
  readUrls(paths: string[], seconds: number): Promise<Map<string, string>>
  /** Deletes the files; a failure is ignored (it only takes space, B71). */
  remove(paths: string[]): Promise<void>
}

export async function getStorage(): Promise<StorageProvider> {
  if (isTestMode()) return (await import('./test-storage')).testStorage
  return (await import('./supabase-storage')).supabaseStorage()
}
