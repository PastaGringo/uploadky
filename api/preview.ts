/**
 * HTML shell with request-time Open Graph tags.
 *
 * `/` and `/<user-key>/<file-id>` rewrite here so crawlers (Twitter, Slack,
 * Discord, iMessage, LinkedIn, Google, Facebook) see absolute preview tags in
 * the first HTML bytes. Humans still get the SPA body.
 *
 * `/index.html` is left as a static file so this function can fetch it without
 * looping back into itself.
 */

import {
  applyPreview,
  landingPreview,
  parseSharePath,
  publicOrigin,
  sharePagePreview,
} from '../server/preview'

export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  const origin = publicOrigin(request)
  const url = new URL(request.url)
  const key = url.searchParams.get('key')
  const id = url.searchParams.get('id')
  const share = key && id ? parseSharePath(`/${key}/${id}`) : null

  const html = await loadIndexHtml(origin)
  const preview = share ? await sharePagePreview(origin, share) : landingPreview(origin)

  return new Response(applyPreview(html, preview), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  })
}

async function loadIndexHtml(origin: string): Promise<string> {
  try {
    const response = await fetch(`${origin}/index.html`, {
      headers: { accept: 'text/html' },
      signal: AbortSignal.timeout(2_000),
    })
    if (response.ok) return await response.text()
  } catch {
    // Fall through to the embedded shell.
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- preview-meta -->
    <!-- /preview-meta -->
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`
}
