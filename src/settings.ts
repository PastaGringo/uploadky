/**
 * Deployment settings.
 *
 * Resolved at BUILD time from `VITE_*`. There used to be a `/config.json`
 * fetched before the first render, so one image could serve any environment —
 * that mattered for a Docker deployment. It was dropped: it blocked first paint
 * on a network round-trip to hand back values that never change, and on a
 * platform where a redeploy is a push, changing an env var and redeploying is
 * simpler than shipping a config endpoint.
 *
 * Only `homeserverHttpBase` really varies, and only for someone running their
 * own homeserver.
 */

export interface Settings {
  /** ICANN base URL of the homeserver, used to build public file URLs. */
  homeserverHttpBase: string
  /**
   * Optional separate short-link domain. Empty means the app uses its own
   * origin, which is always correct — it serves the share page itself.
   */
  shareBase: string
  /** Local testnet instead of the public network. */
  isTestnet: boolean
  testnetHost?: string
  httpRelay?: string
}

const resolved: Settings = {
  homeserverHttpBase: (
    import.meta.env.VITE_HOMESERVER_HTTP_BASE?.trim() || 'https://homeserver.pubky.app'
  ).replace(/\/+$/, ''),
  shareBase: (import.meta.env.VITE_SHARE_BASE?.trim() || '').replace(/\/+$/, ''),
  isTestnet: import.meta.env.VITE_PUBKY_TESTNET === 'true',
  testnetHost: import.meta.env.VITE_PUBKY_TESTNET_HOST?.trim() || undefined,
  httpRelay: import.meta.env.VITE_PUBKY_HTTP_RELAY?.trim() || undefined,
}

export function settings(): Settings {
  return resolved
}
