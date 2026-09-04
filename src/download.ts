import { FILES_DIR, META_DIR } from './config'
import { escapeHtml, formatDate } from './html'
import { iconExternal, iconForType, iconLock } from './icons'
import { brandHtml } from './landing'
import { settings } from './settings'
import { formatBytes, type Upload } from './storage'

/**
 * The download page.
 *
 * A share link opens THIS, not the raw bytes: the visitor sees what they are
 * about to get — name, size, kind, date — before anything downloads.
 *
 * It needs no session and no SDK. `/pub/` is publicly readable, so the
 * descriptor is fetched with a plain `fetch`. That is the whole point of the
 * storage model: a stranger with a link can read, and nothing else.
 */

export interface ShareTarget {
  ownerKey: string
  fileId: string
}

const PUBKY_KEY = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/

/** `/<user-key>/<file-id>` — or null when this is not a share link. */
export function parseShareUrl(pathname: string): ShareTarget | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length !== 2) return null

  const [ownerKey, fileId] = parts
  if (!PUBKY_KEY.test(ownerKey)) return null
  if (!fileId || fileId.length > 128) return null

  return { ownerKey, fileId }
}

export function fileUrl({ ownerKey, fileId }: ShareTarget) {
  return `${settings().homeserverHttpBase}${FILES_DIR}${encodeURIComponent(fileId)}?pubky-host=${ownerKey}`
}

function metaUrlFor({ ownerKey, fileId }: ShareTarget) {
  return `${settings().homeserverHttpBase}${META_DIR}${encodeURIComponent(fileId)}.json?pubky-host=${ownerKey}`
}

/**
 * Read the public descriptor. A missing one is not fatal: the bytes may still
 * be there, we just cannot show a real name.
 */
export async function fetchShareMeta(target: ShareTarget): Promise<Upload | null> {
  try {
    const response = await fetch(metaUrlFor(target), { cache: 'no-store' })
    if (!response.ok) return null

    const raw: unknown = await response.json()
    if (typeof raw !== 'object' || raw === null) return null

    const value = raw as Record<string, unknown>
    const size = Number(value.size)

    return {
      id: String(value.id || target.fileId),
      name: String(value.name || target.fileId),
      type: String(value.type || 'application/octet-stream'),
      size: Number.isFinite(size) && size >= 0 ? size : 0,
      uploadedAt: String(value.uploadedAt || ''),
    }
  } catch {
    return null
  }
}

/** Does the file itself exist? Asked with HEAD so nothing is transferred. */
export async function shareExists(target: ShareTarget): Promise<boolean> {
  try {
    const response = await fetch(fileUrl(target), { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

export type DownloadState =
  | { status: 'loading' }
  | { status: 'ready'; meta: Upload | null }
  | { status: 'missing' }

export function downloadViewHtml(target: ShareTarget, state: DownloadState) {
  return `
    <div class="shell solo">
      <div>
        ${brandHtml()}
        <section class="card download-card">${downloadBody(target, state)}</section>
        <p class="download-foot">
          Stored on the sender's own homeserver &middot;
          uploadky holds no copy of this file
        </p>
      </div>
    </div>
  `
}

function downloadBody(target: ShareTarget, state: DownloadState) {
  if (state.status === 'loading') {
    return `<div class="download-empty"><span class="spinner"></span><p>Looking for this file…</p></div>`
  }

  if (state.status === 'missing') {
    return `
      <div class="download-empty">
        <h2>Nothing here</h2>
        <p class="muted">
          This link points at a file that is gone, or was never there. Whoever
          sent it can delete a file at any time — that is their storage, not ours.
        </p>
      </div>
    `
  }

  const meta = state.meta
  const name = meta?.name || target.fileId
  const url = fileUrl(target)

  return `
    <div class="download-head">
      <span class="download-kind">${iconForType(meta?.type || '', 22)}</span>
      <div class="download-title">
        <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
        <span class="file-meta">
          ${meta ? escapeHtml(formatBytes(meta.size)) : 'unknown size'}
          ${meta?.uploadedAt ? ` &middot; ${escapeHtml(formatDate(meta.uploadedAt))}` : ''}
        </span>
      </div>
    </div>

    <button id="download-file" type="button" class="btn amber block"
            data-url="${escapeHtml(url)}" data-name="${escapeHtml(name)}">
      Download
    </button>

    <p class="download-note">
      ${iconLock()}
      <span>
        Fetched straight from the sender's homeserver.
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener">
          Open directly ${iconExternal(12)}
        </a>
      </span>
    </p>
  `
}

/**
 * Save the file under its original name.
 *
 * A cross-origin `<a download>` is ignored by browsers — the attribute only
 * works same-origin — so the link alone would open the file instead of saving
 * it, under an opaque id rather than its real name. Fetching to a blob is what
 * restores the filename. The bytes still come straight from the homeserver;
 * they never pass through uploadky.
 */
export async function saveFile(url: string, name: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`The homeserver answered ${response.status}.`)

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  // Give the browser a moment to start the save before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}
