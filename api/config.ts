/**
 * Runtime settings, for a serverless deployment.
 *
 * Same contract as the Bun server's `/config.json`: the app fetches this
 * before rendering, so the same build serves any environment. Reading
 * `process.env` here rather than inlining `VITE_*` at build time keeps one
 * behaviour across both deployment styles.
 */

export const config = { runtime: 'edge' }

export default function handler(): Response {
  const homeserverHttpBase = (
    process.env.UPLOADKY_HOMESERVER_HTTP_BASE || 'https://homeserver.pubky.app'
  )
    .trim()
    .replace(/\/+$/, '')

  const shareBase = (process.env.UPLOADKY_SHARE_BASE || '').trim().replace(/\/+$/, '')
  const httpRelay = (process.env.UPLOADKY_HTTP_RELAY || '').trim()
  const testnetHost = (process.env.UPLOADKY_TESTNET_HOST || '').trim()

  const body = {
    homeserverHttpBase,
    shareBase,
    isTestnet: process.env.UPLOADKY_TESTNET === 'true',
    ...(testnetHost ? { testnetHost } : {}),
    ...(httpRelay ? { httpRelay } : {}),
  }

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'content-type': 'application/json',
      // A redeploy with new env must take effect on the next load, not
      // whenever a cache happens to expire.
      'cache-control': 'no-store',
    },
  })
}
