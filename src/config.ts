import type { Capabilities } from '@synonymdev/pubky'

/**
 * Static contract — these never depend on where the app is deployed.
 * Anything deployment-dependent lives in `settings.ts`, resolved at runtime.
 */

/**
 * The app id IS the first segment under /pub/, per the pubky-app-specs
 * convention. Domain and storage namespace are the same string.
 */
export const APP_CLIENT_ID = 'uploadky.app' as const
export const APP_PATH = `/pub/${APP_CLIENT_ID}/` as const

/** Raw file bytes. */
export const FILES_DIR = `${APP_PATH}files/` as const
/** One JSON descriptor per file: original name, MIME type, size, date. */
export const META_DIR = `${APP_PATH}meta/` as const

/** Where a shared announcement is written, if the user asks for one. */
export const PUBKY_APP_POSTS_DIR = '/pub/pubky.app/posts/' as const

/**
 * Two capabilities, both as narrow as the protocol allows.
 *
 *   /pub/uploadky.app/       our own folder — the whole app lives here
 *   /pub/pubky.app/posts/    write a post, and nothing else on the profile
 *
 * The second is only used when the user presses "Share on pubky.app". It is
 * requested up front so signing in stays one scan; the alternative is a second
 * QR at first share. The scope is deliberately `posts/` and not `pubky.app/`,
 * so uploadky can never touch the profile, follows, tags or bookmarks.
 */
export const APP_CAPABILITIES =
  `${APP_PATH}:rw,${PUBKY_APP_POSTS_DIR}:rw` as Capabilities

/**
 * Ceiling enforced by the homeserver, measured in its storage router
 * (`DefaultBodyLimit::max(100 * 1024 * 1024)`). A larger upload is rejected by
 * the server; we refuse it here to give a useful message instead of a 413.
 */
export const MAX_FILE_BYTES = 100 * 1024 * 1024

/**
 * The project's own repository. Not a deployment setting: it is the same for
 * every instance, and it is where "request a feature" has to land.
 */
export const REPO_URL = 'https://github.com/PastaGringo/uploadky' as const
export const REPO_NEW_ISSUE_URL = `${REPO_URL}/issues/new` as const

export const SHOW_DEVELOPMENT_SIGNUP =
  import.meta.env.DEV && import.meta.env.VITE_SHOW_DEVELOPMENT_SIGNUP !== 'false'

/** Fixed homeserver public key used by Pubky's local testnet. */
export const DEVELOPMENT_SIGNUP_HOMESERVER =
  'pubky8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo'
