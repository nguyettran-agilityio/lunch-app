// The Supabase version of the StorageProvider (B15, B71): the private bucket `dish-photos`, created
// by the Lead, reached with the secret key on the server only. The browser uploads straight to a
// signed upload URL, so the photo does not go through a Server Action's 1 MB body limit.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/server/auth/supabase-provider'
import type { StorageProvider } from './provider'

export const DISH_BUCKET = 'dish-photos'

export function supabaseStorage(client: () => SupabaseClient = adminClient): StorageProvider {
  const bucket = () => client().storage.from(DISH_BUCKET)
  return {
    async uploadUrl(path) {
      const { data, error } = await bucket().createSignedUploadUrl(path)
      if (error || !data) throw new Error(`Supabase Storage could not make an upload URL: ${error?.message ?? 'unknown'}`)
      return data.signedUrl
    },
    async info(path) {
      const { data, error } = await bucket().info(path)
      if (error || !data) return null
      return { size: data.size ?? 0, contentType: data.contentType ?? '' }
    },
    async readUrls(paths, seconds) {
      const out = new Map<string, string>()
      if (!paths.length) return out
      const { data } = await bucket().createSignedUrls(paths, seconds)
      for (const r of data ?? []) if (r.path && r.signedUrl && !r.error) out.set(r.path, r.signedUrl)
      return out
    },
    async remove(paths) {
      if (!paths.length) return
      try {
        await bucket().remove(paths)
      } catch {
        // Ignored: the file only takes space (B71).
      }
    },
  }
}
