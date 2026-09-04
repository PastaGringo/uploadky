import { MAX_FILE_BYTES, REPO_NEW_ISSUE_URL } from './config'
import { disabledAttr, escapeHtml, formatDate } from './html'
import {
  iconCheck,
  iconCopy,
  iconExit,
  iconExternal,
  iconForType,
  iconShare,
  iconSpark,
  iconTrash,
  iconUpload,
} from './icons'
import { formatBytes, shareUrl, type Upload } from './storage'

export function uploadCardHtml(uploads: Upload[], owner: string, busy?: string) {
  return `
    <section class="card">
      ${userBarHtml(owner, busy)}

      <div id="dropzone" class="dropzone" tabindex="0" role="button"
           aria-label="Choose a file to send, or drop one here">
        <span class="dropzone-icon">${iconUpload()}</span>
        <p class="dropzone-main">Drop a file</p>
        <p class="dropzone-sub">or click to choose &middot; up to ${formatBytes(MAX_FILE_BYTES)}</p>
      </div>
      <input id="file-input" type="file" hidden ${disabledAttr(Boolean(busy))} />
      <div id="upload-progress"></div>

      <div id="uploads-list">${uploadsListHtml(uploads, owner, busy)}</div>

      <p class="card-foot">
        ${iconSpark()}
        <span>Missing something?</span>
        <a href="${REPO_NEW_ISSUE_URL}" target="_blank" rel="noopener">
          Request a feature ${iconExternal(12)}
        </a>
      </p>
    </section>
  `
}

export function updateUploadsList(uploads: Upload[], owner: string, busy?: string) {
  const list = document.querySelector('#uploads-list')
  if (list) list.innerHTML = uploadsListHtml(uploads, owner, busy)
}

export function updateProgress(text: string) {
  const slot = document.querySelector('#upload-progress')
  if (slot) slot.innerHTML = text ? `<p class="progress">${escapeHtml(text)}</p>` : ''
}

/** Swap a copy button to a tick, then back — feedback without a toast. */
export function flashCopied(id: string) {
  const button = document.querySelector<HTMLButtonElement>(`[data-copy-id="${CSS.escape(id)}"]`)
  if (!button) return

  button.innerHTML = iconCheck()
  button.classList.add('is-done')

  window.setTimeout(() => {
    if (!button.isConnected) return
    button.innerHTML = iconCopy()
    button.classList.remove('is-done')
  }, 1400)
}

function userBarHtml(owner: string, busy?: string) {
  return `
    <div class="user-bar">
      <p class="pubky-id" title="${escapeHtml(owner)}">${escapeHtml(owner)}</p>
      <button id="sign-out" type="button" class="btn icon" title="Sign out"
              aria-label="Sign out" ${disabledAttr(Boolean(busy))}>${iconExit(16)}</button>
    </div>
  `
}

function uploadsListHtml(uploads: Upload[], owner: string, busy?: string) {
  if (uploads.length === 0) {
    return '<p class="empty">Nothing sent yet.</p>'
  }

  return `<ul class="file-list">${uploads.map((u) => uploadItem(u, owner, busy)).join('')}</ul>`
}

function uploadItem(upload: Upload, owner: string, busy?: string) {
  const url = shareUrl(owner, upload.id)
  const off = disabledAttr(Boolean(busy))

  return `
    <li>
      <span class="file-kind">${iconForType(upload.type)}</span>
      <span class="file-main">
        <strong title="${escapeHtml(upload.name)}">${escapeHtml(upload.name)}</strong>
        <span class="file-meta">
          ${escapeHtml(formatBytes(upload.size))} &middot; ${escapeHtml(formatDate(upload.uploadedAt))}
        </span>
      </span>
      <span class="actions">
        <button type="button" class="btn icon" data-copy-id="${escapeHtml(upload.id)}"
                title="Copy link" aria-label="Copy link to ${escapeHtml(upload.name)}"
                data-url="${escapeHtml(url)}" ${off}>${iconCopy()}</button>
        <button type="button" class="btn icon" data-share-id="${escapeHtml(upload.id)}"
                title="Share on pubky.app" aria-label="Share ${escapeHtml(upload.name)} on pubky.app"
                ${off}>${iconShare()}</button>
        <button type="button" class="btn icon" data-delete-id="${escapeHtml(upload.id)}"
                title="Delete" aria-label="Delete ${escapeHtml(upload.name)}" ${off}>${iconTrash()}</button>
      </span>
    </li>
  `
}
