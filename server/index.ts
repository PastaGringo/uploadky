/**
 * uploadky server — three jobs, no framework.
 *
 *   GET /raw/<user-key>/<file-id> 302 to the file on the user's homeserver
 *   GET /<user-key>/<file-id>     SPA with file-specific Open Graph tags
 *   everything else               the built SPA from dist/
 *
 * NOTHING here knows its own domain. A 302 only needs the destination, so the
 * same image runs behind any hostname — no rebuild, no baked-in origin.
 * Preview URLs are taken from the request Host.
 *
 * The redirect never proxies. The browser fetches straight from the homeserver,
 * so this process carries no file bytes and costs nothing to run at any volume.
 */

import { file } from 'bun'
import { join, normalize } from 'node:path'
import {
  applyPreview,
  landingPreview,
  parseSharePath,
  publicOrigin,
  sharePagePreview,
} from './preview'

const PORT = Number(process.env.PORT || 8080)
const DIST = process.env.UPLOADKY_DIST || './dist'

/** Where files actually live. The only value the redirect truly needs. */
const HOMESERVER = (process.env.UPLOADKY_HOMESERVER_HTTP_BASE || 'https://homeserver.pubky.app')
  .trim()
  .replace(/\/+$/, '')

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

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)
    const path = decodeURIComponent(url.pathname)

    if (path === '/healthz') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } })
    }

    // `/raw/<key>/<id>` still redirects straight to the bytes — useful for
    // embedding, and it works without JavaScript. The plain `/<key>/<id>` form
    // now falls through to the app, which shows what the file IS before
    // downloading anything.
    if (path.startsWith('/raw/')) {
      const redirect = shareRedirect(path.slice(4))
      if (redirect) {
        return new Response(null, {
          status: 302,
          headers: { location: redirect, 'cache-control': 'public, max-age=60' },
        })
      }
      return new Response('Not found', { status: 404 })
    }

    return serveStatic(request, path)
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

async function serveStatic(request: Request, path: string): Promise<Response> {
  // normalize() collapses `..`, and the prefix check refuses anything that
  // still escapes dist/ — a path traversal would otherwise read the filesystem.
  const wanted = normalize(join(DIST, path === '/' ? '/index.html' : path))
  const root = normalize(DIST)

  if (!wanted.startsWith(root)) return new Response('Not found', { status: 404 })

  const asset = file(wanted)
  if (await asset.exists() && path !== '/' && !wanted.endsWith('/index.html')) {
    const immutable = wanted.includes('/assets/')
    return new Response(asset, {
      headers: {
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
    })
  }

  return serveSpa(request, path)
}

async function serveSpa(request: Request, path: string): Promise<Response> {
  const shell = file(join(normalize(DIST), 'index.html'))
  if (!(await shell.exists())) {
    return new Response('Not found', { status: 404 })
  }

  const html = await shell.text()
  const origin = publicOrigin(request)
  const share = parseSharePath(path)
  const preview = share ? await sharePagePreview(origin, share) : landingPreview(origin)

  return new Response(applyPreview(html, preview), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    },
  })
}

console.log(`uploadky listening on :${server.port}`)
console.log(`  homeserver  ${HOMESERVER}`)
