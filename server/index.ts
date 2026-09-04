/**
 * uploadky server — three jobs, no framework.
 *
 *   GET /config.json          runtime settings, built from env vars
 *   GET /<user-key>/<file-id> 302 to the file on the user's homeserver
 *   everything else           the built SPA from dist/
 *
 * NOTHING here knows its own domain. A 302 only needs the destination, so the
 * same image runs behind any hostname — no rebuild, no baked-in origin.
 *
 * The redirect never proxies. The browser fetches straight from the homeserver,
 * so this process carries no file bytes and costs nothing to run at any volume.
 */

import { file } from 'bun'
import { join, normalize } from 'node:path'

const PORT = Number(process.env.PORT || 8080)
const DIST = process.env.UPLOADKY_DIST || './dist'

/** Where files actually live. The only value the redirect truly needs. */
const HOMESERVER = (process.env.UPLOADKY_HOMESERVER_HTTP_BASE || 'https://homeserver.pubky.app')
  .trim()
  .replace(/\/+$/, '')

/**
 * The public origin of THIS service, handed to the browser so it can build
 * pretty share links. Empty means "no short links" and the app falls back to
 * homeserver URLs — which always work. Never defaulted to a real domain.
 */
const SHARE_BASE = (process.env.UPLOADKY_SHARE_BASE || '').trim().replace(/\/+$/, '')

const HTTP_RELAY = (process.env.UPLOADKY_HTTP_RELAY || '').trim()
const TESTNET = process.env.UPLOADKY_TESTNET === 'true'
const TESTNET_HOST = (process.env.UPLOADKY_TESTNET_HOST || '').trim()

/** Must match the app: /pub/<app id>/files/ */
const FILES_PREFIX = '/pub/uploadky.app/files/'

/**
 * z-base32, the alphabet Pubky keys use. Validating the key is what keeps this
 * from being an open redirect: without it, `/<anything>/<anything>` could be
 * pointed at an arbitrary host.
 */
const PUBKY_KEY = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/
/** Ids we generate: base36 stamp, dash, 8 hex, optional extension. */
const FILE_ID = /^[a-z0-9]{1,12}-[a-z0-9]{8}(\.[a-z0-9]{1,8})?$/i

const CONFIG = JSON.stringify(
  {
    homeserverHttpBase: HOMESERVER,
    shareBase: SHARE_BASE,
    isTestnet: TESTNET,
    ...(TESTNET_HOST ? { testnetHost: TESTNET_HOST } : {}),
    ...(HTTP_RELAY ? { httpRelay: HTTP_RELAY } : {}),
  },
  null,
  2,
)

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)
    const path = decodeURIComponent(url.pathname)

    if (path === '/healthz') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } })
    }

    // Runtime settings. `no-store` so a redeploy with new env takes effect on
    // the next load rather than whenever a cache happens to expire.
    if (path === '/config.json') {
      return new Response(CONFIG, {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    }

    const redirect = shareRedirect(path)
    if (redirect) {
      return new Response(null, {
        status: 302,
        headers: { location: redirect, 'cache-control': 'public, max-age=60' },
      })
    }

    return serveStatic(path)
  },
})

/** `/<user-key>/<file-id>` -> the homeserver URL, or null if it is not one. */
function shareRedirect(path: string): string | null {
  const parts = path.split('/').filter(Boolean)
  if (parts.length !== 2) return null

  const [key, id] = parts
  if (!PUBKY_KEY.test(key) || !FILE_ID.test(id)) return null

  return `${HOMESERVER}${FILES_PREFIX}${encodeURIComponent(id)}?pubky-host=${key}`
}

async function serveStatic(path: string): Promise<Response> {
  // normalize() collapses `..`, and the prefix check refuses anything that
  // still escapes dist/ — a path traversal would otherwise read the filesystem.
  const wanted = normalize(join(DIST, path === '/' ? '/index.html' : path))
  const root = normalize(DIST)

  if (!wanted.startsWith(root)) return new Response('Not found', { status: 404 })

  const asset = file(wanted)
  if (await asset.exists()) {
    const immutable = wanted.includes('/assets/')
    return new Response(asset, {
      headers: {
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
    })
  }

  // Single-page app: unknown paths fall back to the shell.
  const shell = file(join(root, 'index.html'))
  if (await shell.exists()) {
    return new Response(shell, { headers: { 'cache-control': 'no-cache' } })
  }

  return new Response('Not found', { status: 404 })
}

console.log(`uploadky listening on :${server.port}`)
console.log(`  homeserver  ${HOMESERVER}`)
console.log(`  share base  ${SHARE_BASE || '(none — links point at the homeserver)'}`)
