/**
 * Deployment settings, resolved at RUNTIME.
 *
 * Vite inlines `VITE_*` at build time, so a value set in a container's
 * `environment:` would never reach an already-built bundle. To keep one image
 * configurable per environment, the container writes `/config.json` at start
 * from its env vars, and the app reads it before rendering.
 *
 * Order of precedence, lowest first:
 *   1. the defaults below
 *   2. build-time `VITE_*` (convenient in local dev via .env)
 *   3. `/config.json` (what a Docker deployment actually uses)
 *
 * A missing or malformed `/config.json` is not an error: local `bun run dev`
 * has no such file, and the app must still start.
 */

export interface Settings {
  /** ICANN base URL of the homeserver, used to build public file URLs. */
  homeserverHttpBase: string
  /** Optional short-link front (e.g. https://links.example.com). Empty disables it. */
  shareBase: string
  /** Local testnet instead of the public network. */
  isTestnet: boolean
  testnetHost?: string
  httpRelay?: string
}

const defaults: Settings = {
  homeserverHttpBase: 'https://homeserver.pubky.app',
  shareBase: '',
  isTestnet: false,
  testnetHost: undefined,
  httpRelay: undefined,
}

const fromBuild: Partial<Settings> = {
  homeserverHttpBase: import.meta.env.VITE_HOMESERVER_HTTP_BASE?.trim() || undefined,
  shareBase: import.meta.env.VITE_SHARE_BASE?.trim() || undefined,
  isTestnet: import.meta.env.VITE_PUBKY_TESTNET === 'true' ? true : undefined,
  testnetHost: import.meta.env.VITE_PUBKY_TESTNET_HOST?.trim() || undefined,
  httpRelay: import.meta.env.VITE_PUBKY_HTTP_RELAY?.trim() || undefined,
}

let current: Settings = { ...defaults, ...compact(fromBuild) }

export function settings(): Settings {
  return current
}

/**
 * Fetch `/config.json` and layer it on top. Call once, before rendering.
 *
 * Never throws: a deployment without the file, or with a broken one, falls back
 * to build-time values rather than showing a blank page.
 */
export async function loadRuntimeSettings(): Promise<void> {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' })
    if (!response.ok) return

    const raw: unknown = await response.json()
    if (!isRecord(raw)) return

    current = { ...current, ...compact(readSettings(raw)) }
  } catch {
    // No file in dev, or offline. Build-time values stand.
  }
}

function readSettings(raw: Record<string, unknown>): Partial<Settings> {
  return {
    homeserverHttpBase: trimmed(raw.homeserverHttpBase),
    shareBase: typeof raw.shareBase === 'string' ? raw.shareBase.trim() : undefined,
    isTestnet: typeof raw.isTestnet === 'boolean' ? raw.isTestnet : undefined,
    testnetHost: trimmed(raw.testnetHost),
    httpRelay: trimmed(raw.httpRelay),
  }
}

function trimmed(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Drop undefined keys so they do not overwrite a lower-precedence value. */
function compact<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
