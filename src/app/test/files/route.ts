// /test/files?path=…: the stand-in for the `dish-photos` bucket of the test version of the
// StorageProvider (B71). PUT stores the body as that file, as a signed upload URL does (a path
// already there is refused, like Supabase without upsert); GET shows it; GET with `list=1` gives
// the paths stored under `prefix`, so a test can check that an old photo was deleted. A browser
// with the cookie `test_upload_fail=1` gets its uploads refused, as with no network (AC211); with
// `test_upload_bad=1` its uploads are stored as not an image, which Save then refuses (AC217).
// Test sign-in mode only (B46).
import { eq, like } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { testFiles } from '@/server/auth/test-tables'
import { getDb } from '@/server/db/client'
import { testRouteClosed } from '../guard'

export async function GET(request: NextRequest) {
  const closed = await testRouteClosed()
  if (closed) return closed
  const params = request.nextUrl.searchParams
  if (params.get('list') === '1') {
    const rows = await getDb()
      .select({ path: testFiles.path })
      .from(testFiles)
      .where(like(testFiles.path, `${params.get('prefix') ?? ''}%`))
    return Response.json(rows.map((r) => r.path).sort())
  }
  const [f] = await getDb()
    .select()
    .from(testFiles)
    .where(eq(testFiles.path, params.get('path') ?? ''))
  if (!f) return new Response('Not found', { status: 404 })
  return new Response(Buffer.from(f.data, 'base64'), { headers: { 'content-type': f.contentType } })
}

export async function PUT(request: NextRequest) {
  const closed = await testRouteClosed()
  if (closed) return closed
  if (request.cookies.get('test_upload_fail')?.value === '1') return new Response('Upload failed', { status: 503 })
  const path = request.nextUrl.searchParams.get('path') ?? ''
  if (!path) return new Response('No path', { status: 400 })
  const bytes = Buffer.from(await request.arrayBuffer())
  // `test_upload_bad=1`: the upload reaches the bucket but is not an image, so Save refuses it (AC217).
  const contentType = request.cookies.get('test_upload_bad')?.value === '1' ? 'text/plain' : (request.headers.get('content-type') ?? '')
  const inserted = await getDb()
    .insert(testFiles)
    .values({ path, contentType, data: bytes.toString('base64'), size: bytes.length })
    .onConflictDoNothing()
    .returning({ path: testFiles.path })
  return inserted.length ? Response.json({ path }) : new Response('Exists', { status: 409 })
}
