/**
 * Open Graph / Twitter / Slack preview HTML.
 *
 * Crawlers do not run the Vite SPA, so share pages must carry file-specific
 * <meta> tags in the first HTML bytes. This module is used by the Bun server
 * and by the Vercel Edge function — keep it free of Node-only APIs.
 *
 * NOTHING here bakes a public hostname. og:url and og:image are always built
 * from the request origin (or an already-absolute homeserver file URL).
 */

export const PUBKY_KEY = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/

const FILES_PREFIX = '/pub/uploadky.app/files/'
const META_PREFIX = '/pub/uploadky.app/meta/'
const META_TIMEOUT_MS = 2_000
const MAX_CARD_IMAGE_BYTES = 5 * 1024 * 1024
const CARD_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
])

const PREVIEW_BLOCK = /<!-- preview-meta -->[\s\S]*?<!-- \/preview-meta -->/

export const SITE_NAME = 'uploadky'
export const LANDING_TITLE = 'uploadky — Send a file. Keep it yours.'
export const LANDING_DESCRIPTION =
  'Drop a file, get a link. It is stored on your Pubky homeserver, not ours.'
export const OG_IMAGE_PATH = '/og.png'
export const OG_IMAGE_TYPE = 'image/png'
export const OG_IMAGE_ALT = 'uploadky — Send a file. Keep it yours.'
export const THEME_COLOR = '#06181a'

export interface ShareTarget {
  ownerKey: string
  fileId: string
}

export interface FileMeta {
  id: string
  name: string
  type: string
  size: number
  uploadedAt: string
}

export interface Preview {
  title: string
  description: string
  url: string
  image: string
  imageType: string
  imageAlt: string
  jsonLd?: Record<string, unknown>
}

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#039;'
      default:
        return char
    }
  })
}

export function parseSharePath(pathname: string): ShareTarget | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length !== 2) return null

  let ownerKey: string
  let fileId: string
  try {
    ownerKey = decodeURIComponent(parts[0])
    fileId = decodeURIComponent(parts[1])
  } catch {
    return null
  }

  if (!PUBKY_KEY.test(ownerKey)) return null
  if (!fileId || fileId.length > 128) return null

  return { ownerKey, fileId }
}

export function publicOrigin(request: Request): string {
  const url = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = (forwardedHost || request.headers.get('host') || url.host).split(',')[0].trim()
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const proto = (forwardedProto || url.protocol.replace(/:$/, '')).split(',')[0].trim() || 'https'
  return `${proto}://${host}`.replace(/\/+$/, '')
}

export function homeserverHttpBase(): string {
  return (
    process.env.UPLOADKY_HOMESERVER_HTTP_BASE?.trim() ||
    process.env.VITE_HOMESERVER_HTTP_BASE?.trim() ||
    'https://homeserver.pubky.app'
  ).replace(/\/+$/, '')
}

export function fileBytesUrl(target: ShareTarget): string {
  return `${homeserverHttpBase()}${FILES_PREFIX}${encodeURIComponent(target.fileId)}?pubky-host=${target.ownerKey}`
}

export function metaUrl(target: ShareTarget): string {
  return `${homeserverHttpBase()}${META_PREFIX}${encodeURIComponent(target.fileId)}.json?pubky-host=${target.ownerKey}`
}

export function landingPreview(origin: string): Preview {
  const url = `${origin}/`
  return {
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
    url,
    image: `${origin}${OG_IMAGE_PATH}`,
    imageType: OG_IMAGE_TYPE,
    imageAlt: OG_IMAGE_ALT,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: SITE_NAME,
      description: LANDING_DESCRIPTION,
      url,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
    },
  }
}

export function brandedSharePreview(origin: string, target: ShareTarget): Preview {
  return {
    title: LANDING_TITLE,
    description: "A file shared via uploadky on the sender's Pubky homeserver.",
    url: sharePageUrl(origin, target),
    image: `${origin}${OG_IMAGE_PATH}`,
    imageType: OG_IMAGE_TYPE,
    imageAlt: OG_IMAGE_ALT,
  }
}

export function previewFromMeta(origin: string, target: ShareTarget, meta: FileMeta): Preview {
  const size = formatBytes(meta.size)
  const when = formatUtcDate(meta.uploadedAt)
  const details = [size, when].filter(Boolean).join(' · ')
  const description = details
    ? `${details}. Shared via uploadky on the sender's Pubky homeserver.`
    : "Shared via uploadky on the sender's Pubky homeserver."

  const useFileImage =
    CARD_IMAGE_TYPES.has(meta.type.toLowerCase()) &&
    Number.isFinite(meta.size) &&
    meta.size > 0 &&
    meta.size <= MAX_CARD_IMAGE_BYTES

  return {
    title: meta.name || target.fileId,
    description,
    url: sharePageUrl(origin, target),
    image: useFileImage ? fileBytesUrl(target) : `${origin}${OG_IMAGE_PATH}`,
    imageType: useFileImage ? meta.type.toLowerCase() : OG_IMAGE_TYPE,
    imageAlt: useFileImage ? meta.name || OG_IMAGE_ALT : OG_IMAGE_ALT,
  }
}

export async function fetchShareMeta(target: ShareTarget): Promise<FileMeta | null> {
  try {
    const response = await fetch(metaUrl(target), {
      cache: 'no-store',
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    })
    if (!response.ok) return null

    const raw: unknown = await response.json()
    if (typeof raw !== 'object' || raw === null) return null

    const value = raw as Record<string, unknown>
    const size = Number(value.size)

    return {
      id: String(value.id || target.fileId),
      name: String(value.name || target.fileId),
      type: String(value.type || 'application/octet-stream'),
      size: Number.isFinite(size) && size >= 0 ? size : 0,
      uploadedAt: String(value.uploadedAt || ''),
    }
  } catch {
    return null
  }
}

export async function sharePagePreview(origin: string, target: ShareTarget): Promise<Preview> {
  const meta = await fetchShareMeta(target)
  if (!meta) return brandedSharePreview(origin, target)
  return previewFromMeta(origin, target, meta)
}

export function applyPreview(html: string, preview: Preview): string {
  const block = `<!-- preview-meta -->\n${previewHead(preview)}\n    <!-- /preview-meta -->`
  if (PREVIEW_BLOCK.test(html)) {
    return html.replace(PREVIEW_BLOCK, () => block)
  }

  if (html.includes('</head>')) {
    return html.replace('</head>', `${previewHead(preview)}\n  </head>`)
  }

  return html
}

export function previewHead(preview: Preview): string {
  const title = escapeHtml(preview.title)
  const description = escapeHtml(preview.description)
  const url = escapeHtml(preview.url)
  const image = escapeHtml(preview.image)
  const imageType = escapeHtml(preview.imageType)
  const imageAlt = escapeHtml(preview.imageAlt)
  const site = escapeHtml(SITE_NAME)

  const jsonLd = preview.jsonLd
    ? `\n    <script type="application/ld+json">${jsonLdString(preview.jsonLd)}</script>`
    : ''

  return `    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <meta name="theme-color" content="${THEME_COLOR}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${site}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${imageAlt}" />
    <meta property="og:image:type" content="${imageType}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />${jsonLd}`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`

  const units = ['kB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

function sharePageUrl(origin: string, target: ShareTarget): string {
  return `${origin}/${target.ownerKey}/${encodeURIComponent(target.fileId)}`
}

function formatUtcDate(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function jsonLdString(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
