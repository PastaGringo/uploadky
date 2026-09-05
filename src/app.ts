import type { Session } from '@synonymdev/pubky'
import {
  isAuthorizeRingLink,
  authViewHtml,
  renderRingSigninQr,
  updateAuthorizeLink,
  updateCopyButton,
  updateRingPanel,
  type RingSigninState,
} from './auth-ui'
import { setKeyFieldSeed, startKeyField } from './background'
import {
  downloadViewHtml,
  fetchShareMeta,
  parseShareUrl,
  saveFile,
  shareExists,
  type DownloadState,
  type ShareTarget,
} from './download'
import { flashCopied, updateProgress, updateUploadsList, uploadCardHtml } from './files-ui'
import { copyTextToClipboard, escapeHtml, formatError, statusMessage } from './html'
import { brandHtml, pitchHtml } from './landing'
import {
  getAuthMode,
  isRingAuthCanceled,
  isRingAuthExpired,
  restoreSavedSession,
  saveSession,
  setAuthMode,
  signOut,
  startRingAuthFlow,
  type RingAuthFlow,
} from './pubky'
import { defaultShareMessage, shareOnPubkyApp } from './share'
import {
  deleteUpload,
  formatBytes,
  listUploads,
  shareUrl,
  uploadFile,
  type Upload,
} from './storage'

interface State {
  busy?: string
  error?: string
  notice?: string
  noticePath?: string
  uploads: Upload[]
  ringAuthFlow?: RingAuthFlow
  ringSignin: RingSigninState
  session?: Session
  sharing?: Upload
  /** Set when the URL is a share link: the app renders a download page instead. */
  share?: { target: ShareTarget; state: DownloadState }
}

const state: State = { uploads: [], ringSignin: {} }

let app: HTMLElement

export function start(root: HTMLElement) {
  app = root
  app.addEventListener('click', handleClick)
  app.addEventListener('submit', handleSubmit)
  app.addEventListener('change', handleChange)
  app.addEventListener('keydown', handleKeydown)
  app.addEventListener('dragover', handleDragOver)
  app.addEventListener('dragleave', handleDragLeave)
  app.addEventListener('drop', handleDrop)

  startKeyField()

  // A share link is a whole different page. Decide before anything else, so a
  // visitor following a link never sees a sign-in form flash first.
  const target = parseShareUrl(window.location.pathname)
  if (target) {
    state.share = { target, state: { status: 'loading' } }
    setKeyFieldSeed(target.ownerKey)
    mount()
    void loadShare(target)
    return
  }

  mount()
  void init()
}

/**
 * Resolve a share link with no session at all. `/pub/` is world-readable, so a
 * plain fetch is enough — that is the storage model doing its job.
 */
async function loadShare(target: ShareTarget) {
  const [meta, exists] = await Promise.all([fetchShareMeta(target), shareExists(target)])

  // A descriptor may be missing while the bytes are fine, so existence of the
  // FILE is what decides, not the metadata.
  state.share = {
    target,
    state: exists ? { status: 'ready', meta } : { status: 'missing' },
  }
  mount()
}

async function init() {
  await run('Restoring your session…', async () => {
    const session = await restoreSavedSession()
    if (session) await activateSession(session, 'Welcome back.')
  })

  if (!state.session) await refreshRingSignin(Boolean(state.error))
}

// ------------------------------------------------------------------ render

function mount() {
  if (state.share) {
    app.innerHTML = downloadViewHtml(state.share.target, state.share.state)
    return
  }

  const session = state.session

  app.innerHTML = session
    ? `<div class="shell solo">
         <div>
           ${brandHtml()}
           <div id="status">${statusHtml()}</div>
           ${uploadCardHtml(state.uploads, owner(session), state.busy)}
         </div>
       </div>
       ${shareSheetHtml()}`
    : `<div class="shell">
         ${pitchHtml()}
         <div class="signin">
           <div id="status">${statusHtml()}</div>
           ${authViewHtml(state.ringSignin, getAuthMode(), state.busy)}
         </div>
       </div>`

  void renderRingSigninQr(state.ringSignin)
  setKeyFieldSeed(session ? owner(session) : undefined)
}

function statusHtml() {
  if (state.busy) return `<p class="status">${escapeHtml(state.busy)}</p>`
  if (state.error) return `<p class="status error">${escapeHtml(state.error)}</p>`
  if (state.notice) return `<p class="status">${statusMessage(state.notice, state.noticePath)}</p>`
  return ''
}

function updateStatus() {
  const status = app.querySelector('#status')
  if (status) status.innerHTML = statusHtml()
}

function canUseAuthorizationUrl() {
  const { authorizationUrl, expired, loading } = state.ringSignin
  return !state.busy && Boolean(authorizationUrl) && !loading && !expired
}

function syncControls() {
  const busy = Boolean(state.busy)
  const loading = Boolean(state.ringSignin.loading)
  const canUse = canUseAuthorizationUrl()

  for (const button of app.querySelectorAll('button')) {
    switch (button.id) {
      case 'refresh-ring-signin':
        button.disabled = busy || loading
        break
      case 'copy-authorization-url':
        button.disabled = !canUse
        break
      default:
        button.disabled = busy
        break
    }
  }

  const input = app.querySelector<HTMLInputElement>('#file-input')
  if (input) input.disabled = busy

  updateAuthorizeLink(canUse, state.ringSignin.authorizationUrl)
}

// ------------------------------------------------------------- share sheet

function shareSheetHtml() {
  const upload = state.sharing
  if (!upload || !state.session) return ''

  const url = shareUrl(owner(state.session), upload.id)

  return `
    <dialog id="share-sheet" class="sheet">
      <form method="dialog" id="share-form" class="sheet-body">
        <h2>Share on pubky.app</h2>
        <p class="muted">
          This writes a post to your own homeserver. pubky.app picks it up from
          there — uploadky posts nothing on your behalf anywhere else.
        </p>
        <label>
          Message
          <textarea name="message" rows="4">${escapeHtml(defaultShareMessage(upload.name, url))}</textarea>
        </label>
        <div class="sheet-actions">
          <button type="button" class="btn" id="share-cancel">Cancel</button>
          <button type="submit" class="btn amber">Post</button>
        </div>
      </form>
    </dialog>
  `
}

function openShareSheet(upload: Upload) {
  state.sharing = upload
  mount()
  const dialog = app.querySelector<HTMLDialogElement>('#share-sheet')
  dialog?.showModal()
}

function closeShareSheet() {
  app.querySelector<HTMLDialogElement>('#share-sheet')?.close()
  state.sharing = undefined
  mount()
}

// ------------------------------------------------------------- interactions

function handleClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return

  if (isAuthorizeRingLink(target)) {
    if (!canUseAuthorizationUrl()) event.preventDefault()
    return
  }

  // Plain anchors (share page, direct link, repository) are the browser's job.
  if (target.closest('a')) return

  if (target.closest('#dropzone') && !state.busy) {
    app.querySelector<HTMLInputElement>('#file-input')?.click()
    return
  }

  const button = target.closest<HTMLButtonElement>('button')
  if (!button || state.busy) return

  if (button.dataset.authMode) {
    // Switching protocol invalidates the code on screen: start a fresh flow.
    setAuthMode(button.dataset.authMode === 'cookie' ? 'cookie' : 'grant')
    void refreshRingSignin()
    return
  }

  if (button.dataset.copyId) {
    void handleCopyShareUrl(button.dataset.copyId, button.dataset.url)
    return
  }

  if (button.dataset.shareId) {
    const upload = state.uploads.find((item) => item.id === button.dataset.shareId)
    if (upload) openShareSheet(upload)
    return
  }

  if (button.dataset.deleteId) {
    void handleDeleteUpload(button.dataset.deleteId)
    return
  }

  if (button.id === 'download-file') {
    void handleDownload(button)
    return
  }

  switch (button.id) {
    case 'refresh-ring-signin':
      void refreshRingSignin()
      break
    case 'copy-authorization-url':
      void handleCopyAuthorizationUrl()
      break
    case 'share-cancel':
      closeShareSheet()
      break
    case 'sign-out':
      void handleSignOut()
      break
    default:
      break
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const target = event.target
  if (!(target instanceof Element) || !target.closest('#dropzone') || state.busy) return

  event.preventDefault()
  app.querySelector<HTMLInputElement>('#file-input')?.click()
}

function handleChange(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || input.id !== 'file-input') return

  const file = input.files?.[0]
  // Reset so choosing the same file twice in a row still fires a change event.
  input.value = ''
  if (file) void handleUpload(file)
}

function handleDragOver(event: DragEvent) {
  if (!state.session || state.busy) return
  const zone = dropzoneFrom(event.target)
  if (!zone) return

  event.preventDefault()
  zone.classList.add('is-over')
}

function handleDragLeave(event: DragEvent) {
  dropzoneFrom(event.target)?.classList.remove('is-over')
}

function handleDrop(event: DragEvent) {
  if (!state.session || state.busy) return
  const zone = dropzoneFrom(event.target)
  if (!zone) return

  event.preventDefault()
  zone.classList.remove('is-over')

  const file = event.dataTransfer?.files?.[0]
  if (file) void handleUpload(file)
}

function dropzoneFrom(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>('#dropzone')
}

function handleSubmit(event: SubmitEvent) {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || form.id !== 'share-form') return

  event.preventDefault()
  if (state.busy) return

  const message = String(new FormData(form).get('message') || '')
  void handleShare(message)
}

// ---------------------------------------------------------------- actions

async function handleUpload(file: File) {
  const session = requireSession()

  updateProgress(`Sending ${file.name} (${formatBytes(file.size)})…`)
  await run(`Sending ${file.name}…`, async () => {
    const upload = await uploadFile(session, file)
    setNotice('Sent:', upload.name)
    await refreshUploads()
    updateUploadsList(state.uploads, owner(session), state.busy)
  })
  updateProgress('')
}

async function handleCopyShareUrl(id: string, url?: string) {
  const session = requireSession()

  try {
    await copyTextToClipboard(url || shareUrl(owner(session), id))
    flashCopied(id)
  } catch (error) {
    setError(error)
    updateStatus()
  }
}

async function handleShare(message: string) {
  const session = requireSession()

  await run('Posting to pubky.app…', async () => {
    await shareOnPubkyApp(session, message)
    setNotice('Posted to pubky.app.')
  })

  closeShareSheet()
}

async function handleDeleteUpload(id: string) {
  const session = requireSession()

  await run('Deleting…', async () => {
    await deleteUpload(session, id)
    setNotice('Deleted.')
    await refreshUploads()
    updateUploadsList(state.uploads, owner(session), state.busy)
  })
}

async function handleDownload(button: HTMLButtonElement) {
  const url = button.dataset.url
  const name = button.dataset.name
  if (!url || !name) return

  const label = button.textContent
  button.disabled = true
  button.textContent = 'Downloading…'

  try {
    await saveFile(url, name)
    button.textContent = 'Saved'
  } catch (error) {
    button.textContent = 'Download failed'
    console.error('Download failed', error)
  } finally {
    window.setTimeout(() => {
      if (!button.isConnected) return
      button.disabled = false
      button.textContent = label
    }, 2000)
  }
}

async function refreshUploads() {
  const session = state.session
  if (!session) return
  state.uploads = await listUploads(session)
}

function owner(session: Session) {
  return session.info.publicKey.toString()
}

// -------------------------------------------------------------------- auth

async function refreshRingSignin(preserveError = false) {
  const token = Symbol('ring-signin')
  cancelRingSignin()

  state.ringSignin = { loading: true, token }
  if (!preserveError) state.error = undefined
  updateStatus()
  updateRingPanel(state.ringSignin, getAuthMode(), state.busy)
  syncControls()

  try {
    const flow = await startRingAuthFlow()
    state.ringAuthFlow = flow

    if (!isActiveRingSignin(token)) {
      flow.cancel()
      return
    }

    state.ringSignin = { authorizationUrl: flow.authorizationUrl, token }
    updateRingPanel(state.ringSignin, getAuthMode(), state.busy)
    syncControls()

    void handleRingApproval(flow, token)
  } catch (error) {
    if (!isActiveRingSignin(token)) return

    state.ringAuthFlow = undefined
    state.ringSignin = {}
    setError(error)
    updateStatus()
    updateRingPanel(state.ringSignin, getAuthMode(), state.busy)
    syncControls()
  }
}

async function handleRingApproval(flow: RingAuthFlow, token: symbol) {
  try {
    const session = await flow.awaitApproval
    if (!isActiveRingSignin(token)) return

    state.ringAuthFlow = undefined
    await run('Finishing sign-in…', async () => {
      const persisted = await saveSession(session)
      await activateSession(
        session,
        persisted
          ? 'Signed in.'
          : 'Signed in. On the legacy protocol this session ends when you reload.',
      )
    })
  } catch (error) {
    if (isRingAuthCanceled(error) || !isActiveRingSignin(token)) return

    state.ringAuthFlow = undefined
    state.ringSignin = isRingAuthExpired(error) ? { expired: true, token } : {}
    setError(error)
    updateStatus()
    updateRingPanel(state.ringSignin, getAuthMode(), state.busy)
    syncControls()
  }
}

async function handleCopyAuthorizationUrl() {
  const authorizationUrl = state.ringSignin.authorizationUrl
  if (!authorizationUrl || state.ringSignin.expired) return

  try {
    await copyTextToClipboard(authorizationUrl)
    state.ringSignin.copied = true
    updateCopyButton(true)

    window.setTimeout(() => {
      if (state.ringSignin.authorizationUrl !== authorizationUrl) return
      state.ringSignin.copied = false
      updateCopyButton(false)
    }, 2200)
  } catch (error) {
    setError(error)
    updateStatus()
  }
}

async function handleSignOut() {
  const session = requireSession()

  await run('Signing out…', async () => {
    await signOut(session)
    state.session = undefined
    state.uploads = []
    state.sharing = undefined
    setNotice('Signed out.')
  })

  if (!state.session) await refreshRingSignin()
}

async function activateSession(session: Session, notice: string) {
  cancelRingSignin()
  state.ringSignin = {}
  state.session = session
  setNotice(notice)
  await refreshUploads()
}

function cancelRingSignin() {
  const flow = state.ringAuthFlow
  state.ringAuthFlow = undefined
  flow?.cancel()
}

function isActiveRingSignin(token: symbol) {
  return state.ringSignin.token === token
}

// -------------------------------------------------------------------- misc

function setNotice(notice: string, path?: string) {
  state.error = undefined
  state.notice = notice
  state.noticePath = path
}

function setError(error: unknown) {
  state.error = formatError(error)
  state.notice = undefined
  state.noticePath = undefined
}

async function run(label: string, task: () => Promise<void>) {
  const hadSession = Boolean(state.session)
  state.busy = label
  state.error = undefined
  updateStatus()
  syncControls()

  try {
    await task()
  } catch (error) {
    setError(error)
  } finally {
    state.busy = undefined
  }

  if (Boolean(state.session) !== hadSession) {
    mount()
    return
  }

  updateStatus()
  syncControls()
}

function requireSession() {
  if (!state.session) throw new Error('No active Pubky session')
  return state.session
}
