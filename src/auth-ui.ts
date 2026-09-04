import { toCanvas } from 'qrcode'
import { APP_PATH, PUBKY_APP_POSTS_DIR } from './config'
import { disabledAttr, escapeHtml } from './html'
import { iconCopy, iconExternal, iconKey } from './icons'
import type { AuthMode } from './pubky'

export interface RingSigninState {
  authorizationUrl?: string
  copied?: boolean
  expired?: boolean
  loading?: boolean
  token?: symbol
}

const RING_QR_SIZE = 220
const AUTHORIZE_LINK_ID = 'authorize-ring'

export function authViewHtml(ringSignin: RingSigninState, authMode: AuthMode, busy?: string) {
  return `<section id="ring-panel" class="card">${ringPanelBody(ringSignin, authMode, busy)}</section>`
}

export function updateRingPanel(ringSignin: RingSigninState, authMode: AuthMode, busy?: string) {
  const panel = document.querySelector('#ring-panel')
  if (!panel) return
  panel.innerHTML = ringPanelBody(ringSignin, authMode, busy)
  void renderRingSigninQr(ringSignin)
}

export function updateCopyButton(copied: boolean) {
  const button = document.querySelector('#copy-authorization-url')
  if (button) button.textContent = copied ? 'Copied' : 'Copy link'
}

export function updateAuthorizeLink(canUse: boolean, authorizationUrl?: string) {
  const link = document.querySelector<HTMLAnchorElement>(`#${AUTHORIZE_LINK_ID}`)
  if (!link) return

  if (canUse && authorizationUrl) {
    link.href = authorizationUrl
    link.removeAttribute('aria-disabled')
    return
  }

  link.removeAttribute('href')
  link.setAttribute('aria-disabled', 'true')
}

export function isAuthorizeRingLink(element: Element) {
  return Boolean(element.closest(`#${AUTHORIZE_LINK_ID}`))
}

export async function renderRingSigninQr(ringSignin: RingSigninState) {
  const canvas = document.querySelector<HTMLCanvasElement>('#ring-signin-qr')
  const authorizationUrl = ringSignin.authorizationUrl
  if (!canvas || !authorizationUrl || ringSignin.expired) return

  try {
    await toCanvas(canvas, authorizationUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: RING_QR_SIZE,
      color: { dark: '#0d1f21', light: '#ffffff' },
    })
  } catch (error) {
    console.error('Failed to render the Pubky Ring QR code', error)
  }
}

function ringPanelBody(ringSignin: RingSigninState, authMode: AuthMode, busy?: string) {
  const { authorizationUrl, copied, expired, loading } = ringSignin
  const isBusy = Boolean(busy)
  const canUse = !isBusy && Boolean(authorizationUrl) && !loading && !expired

  return `
    <div class="card-head">
      <h2>Scan with Pubky Ring</h2>
      <button id="refresh-ring-signin" type="button" class="btn ghost"
              ${disabledAttr(isBusy || Boolean(loading))}>
        ${expired ? 'New code' : 'Refresh'}
      </button>
    </div>

    <div class="ring">
      <div class="qr-frame">${ringQrSlot(ringSignin)}</div>
      <div class="ring-actions">
        ${authorizeLinkHtml(canUse, authorizationUrl)}
        <button id="copy-authorization-url" type="button" class="btn" ${disabledAttr(!canUse)}>
          ${copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>

    ${scopeNoteHtml()}
    ${authModeHtml(authMode, isBusy)}
  `
}

/**
 * Say plainly what is being granted. uploadky's whole claim is that it touches
 * one folder; that claim is worth nothing if the user cannot see it.
 */
function scopeNoteHtml() {
  return `
    <p class="scope-note">
      <span>${iconKey()} uploadky asks for exactly two things, and can reach nothing else:</span>
      <span><code>${escapeHtml(APP_PATH)}</code> — its own folder, where your files go.</span>
      <span><code>${escapeHtml(PUBKY_APP_POSTS_DIR)}</code> — to post a link when you ask it to.</span>
    </p>
  `
}

/**
 * Both directions say what actually happens. Offering "try the newer one" as a
 * neutral choice would be a trap: shipping Pubky Ring rejects the grant URL,
 * and it does so on the phone — no error ever reaches this page, so the user
 * would just see a QR that does nothing and blame the app.
 */
function authModeHtml(mode: AuthMode, isBusy: boolean) {
  const other: AuthMode = mode === 'grant' ? 'cookie' : 'grant'

  const text =
    mode === 'cookie'
      ? `Signing in over the <strong>legacy</strong> protocol. Pubky Ring does not
         read the newer one yet.`
      : `Signing in over the <strong>grant</strong> protocol. Current Pubky Ring
         builds reject it — if nothing happens after you scan, that is why.`

  const action = mode === 'cookie' ? 'Try it anyway' : 'Back to legacy'

  return `
    <p class="auth-mode">
      ${text}
      <button id="toggle-auth-mode" type="button" class="link-button"
              data-auth-mode="${other}" ${disabledAttr(isBusy)}>${action}</button>
    </p>
  `
}

function authorizeLinkHtml(canUse: boolean, authorizationUrl: string | undefined) {
  const label = `Open Pubky Ring ${iconExternal()}`
  if (canUse && authorizationUrl) {
    return `<a id="${AUTHORIZE_LINK_ID}" class="btn primary" href="${escapeHtml(authorizationUrl)}">${label}</a>`
  }
  return `<a id="${AUTHORIZE_LINK_ID}" class="btn primary" aria-disabled="true">${label}</a>`
}

function ringQrSlot(ringSignin: RingSigninState) {
  const { authorizationUrl, expired, loading } = ringSignin

  if (loading) {
    return placeholder('<span class="spinner"></span><span>Generating a code…</span>')
  }
  if (expired) {
    return placeholder('<strong>Code expired</strong><span>Ask for a new one.</span>')
  }
  if (!authorizationUrl) {
    return placeholder(`<span>${iconCopy(20)}</span><span>Waiting for a code…</span>`)
  }

  return `<canvas id="ring-signin-qr" class="ring-qr" width="${RING_QR_SIZE}"
            height="${RING_QR_SIZE}" aria-label="Pubky Ring sign-in QR code"></canvas>`
}

function placeholder(content: string) {
  return `<div class="qr-placeholder" aria-live="polite">${content}</div>`
}
