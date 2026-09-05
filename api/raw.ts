/**
 * `/raw/<user-key>/<file-id>` — 302 straight to the file on the homeserver.
 *
 * Never proxies: the browser fetches from the homeserver, so this function
 * carries no file bytes whatever the volume.
 *
 * SECURITY: the key is validated against the 52-character z-base32 alphabet
 * before any `Location` is built. Without that check, `/raw/<anything>/<x>`
 * would make this an OPEN REDIRECT — an attacker could send phishing links
 * that appear to originate from this domain.
 */

export const config = { runtime: 'edge' }

const PUBKY_KEY = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/
/** Ids the app generates: base36 stamp, dash, 8 hex, optional extension. */
const FILE_ID = /^[a-z0-9]{1,12}-[a-z0-9]{8}(\.[a-z0-9]{1,8})?$/i

const FILES_PREFIX = '/pub/uploadky.app/files/'

export default function handler(request: Request): Response {
  const homeserver = (
    process.env.UPLOADKY_HOMESERVER_HTTP_BASE || 'https://homeserver.pubky.app'
  )
    .trim()
    .replace(/\/+$/, '')

  const { pathname } = new URL(request.url)
  const parts = pathname.replace(/^\/raw\//, '').split('/').filter(Boolean)

  if (parts.length !== 2) return notFound()

  const [key, id] = parts.map((part) => decodeURIComponent(part))
  if (!PUBKY_KEY.test(key) || !FILE_ID.test(id)) return notFound()

  const target = `${homeserver}${FILES_PREFIX}${encodeURIComponent(id)}?pubky-host=${key}`

  return new Response(null, {
    status: 302,
    headers: { location: target, 'cache-control': 'public, max-age=60' },
  })
}

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain' },
  })
}
