import { AuthFlowKind, Keypair, Pubky, PublicKey } from '@synonymdev/pubky'
import type { AuthFlow, GrantAuthFlow, Session } from '@synonymdev/pubky'
import type { Path } from '@synonymdev/pubky'
import { APP_CAPABILITIES, APP_CLIENT_ID, META_DIR } from './config'
import { settings } from './settings'

const SESSION_KEY = `${APP_CLIENT_ID}:session`
const COOKIE_SESSION_KEY = `${APP_CLIENT_ID}:cookie-session`
const RING_AUTH_CANCELED_ERROR_NAME = 'RingAuthCanceled'
const RING_AUTH_EXPIRED_ERROR_NAME = 'RingAuthExpired'
const CLOSED_SIGNUP_MESSAGE =
  'This homeserver does not allow open signup. Start it with \'signup_mode = "open"\' for creating new identities.'

/**
 * Created on first use, never at import time: runtime settings are fetched
 * before rendering, and a client built at import would capture the defaults.
 */
let client: Pubky | undefined

export function pubkyClient(): Pubky {
  if (!client) {
    const { isTestnet, testnetHost } = settings()
    client = isTestnet ? Pubky.testnet(testnetHost) : new Pubky()
  }
  return client
}

export interface RingAuthFlow {
  authorizationUrl: string
  awaitApproval: Promise<Session>
  cancel: () => void
}

export async function signupDevelopmentUser(homeserver: string) {
  const signer = pubkyClient().signer(Keypair.random())
  const homeserverKey = PublicKey.from(homeserver.trim())

  try {
    await signer.signup(homeserverKey, null)
  } catch (error) {
    throw closedSignupError(error)
  }

  return signer.signin(APP_CLIENT_ID)
}

/**
 * Two wire formats exist, and Pubky Ring versions differ in what they accept.
 *
 *   grant  -> `pubkyauth://signin_grant?...&cid=...&cpk=...`  (current)
 *   cookie -> `pubkyauth:///?relay=...&caps=...&secret=...`    (legacy)
 *
 * The homeserver serves both: `/auth/grant/session` answers 415 rather than
 * 404, so the grant routes exist, while `/signup` and `/session` are still
 * there (deprecated). An older Ring that cannot parse `signin_grant` simply
 * does nothing when it scans the QR — no error reaches this app, because the
 * failure happens on the phone. Hence a switch the user can flip.
 */
export type AuthMode = 'grant' | 'cookie'

const AUTH_MODE_KEY = `${APP_CLIENT_ID}:auth-mode`

/**
 * Default: `cookie`.
 *
 * Measured 2026-09-05 against a shipping Pubky Ring: a `signin_grant` QR is
 * rejected with "Unrecognized format. Expected a recovery phrase, invite code,
 * auth URL, or session request." The `signin` form is accepted and completes.
 *
 * This is a usability-over-security default, and a deliberate one: grant is the
 * better model (non-extractable delegated key, revocable, per-app), but an app
 * nobody can sign into protects nothing. The failure is also invisible from
 * here — it happens on the phone, so no error reaches the app and a first-time
 * user would just see a QR that does nothing.
 *
 * Revisit once Ring ships grant support: flip this back and keep `cookie` as
 * the fallback rather than the default.
 */
export function getAuthMode(): AuthMode {
  return localStorage.getItem(AUTH_MODE_KEY) === 'grant' ? 'grant' : 'cookie'
}

export function setAuthMode(mode: AuthMode) {
  localStorage.setItem(AUTH_MODE_KEY, mode)
}

export async function startRingAuthFlow(): Promise<RingAuthFlow> {
  const flow: GrantAuthFlow | AuthFlow =
    getAuthMode() === 'cookie'
      ? pubkyClient().startCookieAuthFlow(APP_CAPABILITIES, AuthFlowKind.signin(), settings().httpRelay)
      : await pubkyClient().startGrantAuthFlow(APP_CAPABILITIES, AuthFlowKind.signin(), {
          clientId: APP_CLIENT_ID,
          relay: settings().httpRelay,
        })

  const approval = awaitRingApproval(flow)

  return {
    authorizationUrl: flow.authorizationUrl,
    awaitApproval: approval.awaitApproval,
    cancel: approval.cancel,
  }
}

/**
 * Persist the session so a page reload does not require scanning again.
 *
 * Two mechanisms, because the two auth models are not the same thing:
 *
 *   grant   `BrowserSessionStore` keeps the delegated key non-extractable in
 *           IndexedDB. Nothing readable is written anywhere.
 *
 *   cookie  The store refuses these ("Only grant-backed sessions can be saved
 *           in BrowserSessionStore."). What actually survives a reload is the
 *           browser's own cookie — HttpOnly, Secure, SameSite=None, Max-Age one
 *           year, as issued by the homeserver. `session.export()` returns the
 *           METADATA needed to rebuild the Session object around that cookie,
 *           not the credential: `restoreSession()` documents that "the
 *           HTTP-only cookie must still be present in the browser".
 *
 * Keeping that snapshot adds no exposure. Any script on this origin can already
 * act as the user without it, since the cookie rides along on every homeserver
 * request the page makes. (`exportLocalSecret()` is a different method and DOES
 * hand back credential material — it is deliberately never called here.)
 *
 * The catch is that the cookie is third-party from this origin. `SameSite=None`
 * permits it, but Safari blocks third-party cookies outright and Chrome is
 * restricting them. On pubky.app the same cookie is first-party — `pubky.app`
 * and `homeserver.pubky.app` share a registrable domain — which is why sessions
 * always stick there and only usually stick here. A restore that fails is
 * treated as a normal signed-out start.
 *
 * @returns whether the session is expected to survive a reload.
 */
export async function saveSession(session: Session): Promise<boolean> {
  try {
    const stored = await pubkyClient().browserSessionStore.save(session)
    localStorage.setItem(SESSION_KEY, stored.id)
    localStorage.removeItem(COOKIE_SESSION_KEY)
    return true
  } catch (error) {
    if (!isNotGrantBackedError(error)) throw error
  }

  try {
    localStorage.setItem(COOKIE_SESSION_KEY, session.export())
    return true
  } catch {
    // Private-mode quotas, or an SDK that declines to export this session.
    return false
  }
}

function isNotGrantBackedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /grant-backed/i.test(message)
}

export async function restoreSavedSession() {
  return (await restoreGrantSession()) ?? (await restoreCookieSession())
}

async function restoreGrantSession() {
  const savedId = localStorage.getItem(SESSION_KEY)
  if (!savedId) return undefined

  try {
    return await pubkyClient().browserSessionStore.restore(savedId)
  } catch (error) {
    if (isInvalidSavedSessionError(error)) {
      await forgetSavedSession(savedId)
      return undefined
    }

    throw error
  }
}

async function restoreCookieSession() {
  const snapshot = localStorage.getItem(COOKIE_SESSION_KEY)
  if (!snapshot) return undefined

  try {
    const session = await pubkyClient().restoreSession(snapshot)

    // Rebuilding the object proves nothing on its own: the snapshot is
    // metadata, so it restores fine even after the browser dropped the cookie.
    // One authenticated read settles it, and does it before the UI says
    // "Welcome back" rather than after.
    await session.storage.list(META_DIR as Path, null, false, 1, false)
    return session
  } catch (error) {
    // A missing folder means a signed-in account that has uploaded nothing.
    if (isNotFoundError(error)) return await pubkyClient().restoreSession(snapshot)

    localStorage.removeItem(COOKIE_SESSION_KEY)
    return undefined
  }
}

export async function signOut(session: Session) {
  const savedId = localStorage.getItem(SESSION_KEY)
  localStorage.removeItem(COOKIE_SESSION_KEY)
  await session.signout()
  await forgetSavedSession(savedId)
}

export function isRingAuthCanceled(error: unknown) {
  return isErrorNamed(error, RING_AUTH_CANCELED_ERROR_NAME)
}

export function isRingAuthExpired(error: unknown) {
  return isErrorNamed(error, RING_AUTH_EXPIRED_ERROR_NAME)
}

function awaitRingApproval(flow: GrantAuthFlow | AuthFlow) {
  let canceled = false
  let freed = false

  const cancel = () => {
    canceled = true
    if (freed) return
    freed = true

    try {
      flow.free()
    } catch {
      // The WASM handle can already be consumed or freed by the time cleanup runs.
    }
  }

  const awaitApproval = (async () => {
    try {
      const session = await flow.awaitApproval()
      if (canceled) throw ringAuthCanceledError()
      return session
    } catch (error) {
      if (canceled) throw ringAuthCanceledError()
      if (isExpiredAuthError(error)) throw ringAuthExpiredError()
      throw error
    }
  })()

  return {
    awaitApproval: awaitApproval.finally(cancel),
    cancel,
  }
}

async function forgetSavedSession(savedId: string | null) {
  localStorage.removeItem(SESSION_KEY)
  if (!savedId) return

  try {
    await pubkyClient().browserSessionStore.remove(savedId)
  } catch {
    // Local IndexedDB state may already be gone after a failed restore.
  }
}

function closedSignupError(error: unknown) {
  if (!isClosedSignupError(error)) {
    return error instanceof Error ? error : new Error(String(error))
  }

  const wrapped = new Error(CLOSED_SIGNUP_MESSAGE)
  wrapped.cause = error
  return wrapped
}

function isClosedSignupError(error: unknown) {
  const statusCode = errorStatusCode(error)
  const text = errorText(error).toLowerCase()

  if (statusCode === 400) return true
  if ((statusCode === 401 || statusCode === 403) && /signup|token|invite/.test(text)) {
    return true
  }

  return (
    isErrorNamed(error, 'AuthenticationError') ||
    text.includes('signup token required') ||
    text.includes('signup_mode') ||
    text.includes('token required')
  )
}

function isExpiredAuthError(error: unknown) {
  const text = errorText(error).toLowerCase()
  return text.includes('expired') || text.includes('timed out') || text.includes('timeout')
}

function isInvalidSavedSessionError(error: unknown) {
  return (
    isErrorNamed(error, 'AuthenticationError') ||
    isErrorNamed(error, 'InvalidInput') ||
    isErrorNamed(error, 'ClientStateError')
  )
}

function isNotFoundError(error: unknown) {
  return errorStatusCode(error) === 404
}

function isErrorNamed(error: unknown, name: string) {
  return error instanceof Error && error.name === name
}

function errorStatusCode(error: unknown) {
  if (!isRecord(error) || !isRecord(error.data)) return undefined
  const statusCode = error.data.statusCode
  return typeof statusCode === 'number' ? statusCode : undefined
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause === undefined ? '' : ` ${errorText(error.cause)}`
    return `${error.name} ${error.message}${cause}`
  }

  return String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function ringAuthCanceledError() {
  const error = new Error('Pubky Ring sign-in canceled')
  error.name = RING_AUTH_CANCELED_ERROR_NAME
  return error
}

function ringAuthExpiredError() {
  const error = new Error('Pubky Ring sign-in link expired. Generate a fresh link and try again.')
  error.name = RING_AUTH_EXPIRED_ERROR_NAME
  return error
}
