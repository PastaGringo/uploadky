import { PubkyResource } from '@synonymdev/pubky'
import type { Path, Session } from '@synonymdev/pubky'
import { FILES_DIR, MAX_FILE_BYTES, META_DIR } from './config'
import { settings } from './settings'

/**
 * An upload is two objects on the homeserver:
 *   files/<id>       the raw bytes
 *   meta/<id>.json   the descriptor below
 *
 * The homeserver stores bytes, not metadata: `putBytes` takes no content type
 * and no filename. Without the sidecar we could not show a real name or serve
 * the right MIME type on download. Both are under /pub/, so both are public —
 * that is intended: the download page needs the descriptor too.
 */
export interface Upload {
  id: string
  name: string
  type: string
  size: number
  uploadedAt: string
}

const LIST_PAGE_SIZE = 50

export function filePath(id: string) {
  return `${FILES_DIR}${id}` as Path
}

export function metaPath(id: string) {
  return `${META_DIR}${id}.json` as Path
}

/**
 * The share link. Anyone can open it — no account, no session, no SDK.
 *
 * `/pub/` is publicly readable by design, so the homeserver serves this to an
 * anonymous request. The `?pubky-host=` form is deliberate: see the note on
 * homeserverHttpBase in settings.ts.
 */
export function shareUrl(ownerPublicKey: string, id: string) {
  const owner = ownerPublicKey.replace(/^pubky/, '')

  // The app serving this page also serves the share page, so its own origin is
  // always a valid front. `shareBase` only overrides it — for a separate
  // short-link domain, say. Falling back to the raw homeserver URL instead
  // would hand out a link that downloads immediately, with no page, no
  // filename and no context.
  const base = (settings().shareBase || selfOrigin()).replace(/\/+$/, '')

  return `${base}/${owner}/${id}`
}

function selfOrigin() {
  return typeof window === 'undefined' ? '' : window.location.origin
}

/** The homeserver URL a share link ultimately resolves to. */
export function directUrl(ownerPublicKey: string, id: string) {
  const owner = ownerPublicKey.replace(/^pubky/, '')
  return `${settings().homeserverHttpBase}${filePath(id)}?pubky-host=${owner}`
}

export function metaUrl(ownerPublicKey: string, id: string) {
  const owner = ownerPublicKey.replace(/^pubky/, '')
  return `${settings().homeserverHttpBase}${metaPath(id)}?pubky-host=${owner}`
}

export class FileTooLargeError extends Error {
  constructor(public readonly size: number) {
    super(
      `File is ${formatBytes(size)}. The homeserver rejects anything over ` +
        `${formatBytes(MAX_FILE_BYTES)} in a single request.`,
    )
    this.name = 'FileTooLargeError'
  }
}

export async function uploadFile(session: Session, file: File): Promise<Upload> {
  if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError(file.size)

  const id = newId(file.name)
  const bytes = new Uint8Array(await file.arrayBuffer())

  const upload: Upload = {
    id,
    name: file.name || id,
    type: file.type || 'application/octet-stream',
    size: file.size,
    uploadedAt: new Date().toISOString(),
  }

  // Bytes first: if the descriptor write fails, a listing built from
  // descriptors simply will not show the file, rather than showing a broken
  // entry that points at nothing.
  await session.storage.putBytes(filePath(id), bytes)
  await session.storage.putJson(metaPath(id), upload)

  return upload
}

export async function deleteUpload(session: Session, id: string) {
  // Descriptor first, so a half-failed delete hides the entry rather than
  // leaving a listed file whose bytes are already gone.
  await session.storage.delete(metaPath(id))
  await session.storage.delete(filePath(id))
}

export async function listUploads(session: Session): Promise<Upload[]> {
  const urls = await listMetaUrls(session)

  const uploads = await Promise.all(
    urls
      .filter((url) => url.endsWith('.json'))
      .map(async (url) => {
        const path = PubkyResource.parse(url).path as Path
        try {
          return toUpload(await session.storage.getJson(path), idFromMetaPath(path))
        } catch {
          // A descriptor that cannot be read is skipped rather than failing the
          // whole listing.
          return undefined
        }
      }),
  )

  return uploads
    .filter((upload): upload is Upload => Boolean(upload))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
}

async function listMetaUrls(session: Session) {
  try {
    const urls: string[] = []
    let cursor: string | null = null

    // `list` returns no cursor field: the last URL of a page IS the cursor for
    // the next one. Taken from the upstream template, which documents it.
    while (true) {
      const batch = await session.storage.list(META_DIR as Path, cursor, true, LIST_PAGE_SIZE, true)
      if (batch.length === 0) break

      const nextCursor = batch[batch.length - 1]
      if (!nextCursor || nextCursor === cursor) break

      urls.push(...batch)
      if (batch.length < LIST_PAGE_SIZE) break
      cursor = nextCursor
    }

    return urls
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
}

/**
 * Sortable by time, unique without coordination, and carrying the original
 * extension so the homeserver and browsers can guess a sensible type.
 */
function newId(originalName: string) {
  const stamp = Date.now().toString(36)
  const random = crypto.randomUUID().slice(0, 8)
  const extension = extensionOf(originalName)
  return `${stamp}-${random}${extension}`
}

function extensionOf(name: string) {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name || '')
  return match ? `.${match[1].toLowerCase()}` : ''
}

function idFromMetaPath(path: string) {
  return (path.split('/').pop() || '').replace(/\.json$/, '')
}

function toUpload(data: unknown, fallbackId: string): Upload {
  const value = isRecord(data) ? data : {}
  const size = Number(value.size)

  return {
    id: String(value.id || fallbackId),
    name: String(value.name || fallbackId),
    type: String(value.type || 'application/octet-stream'),
    size: Number.isFinite(size) && size >= 0 ? size : 0,
    uploadedAt: String(value.uploadedAt || ''),
  }
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`

  const units = ['kB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNotFound(error: unknown) {
  return isRecord(error) && isRecord(error.data) && error.data.statusCode === 404
}
