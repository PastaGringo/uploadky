import { expect, test } from 'bun:test'
import {
  applyPreview,
  brandedSharePreview,
  escapeHtml,
  landingPreview,
  parseSharePath,
  previewFromMeta,
  previewHead,
} from './preview'

const ORIGIN = 'https://uploadky.example'

test('parseSharePath accepts a 52-char z-base32 key', () => {
  const key = 'ybndrfg8ejkmcpqxot1uwisza345h769ybndrfg8ejkmcpqxot1u'
  const parsed = parseSharePath(`/${key}/abc-12345678.pdf`)
  expect(parsed).toEqual({ ownerKey: key, fileId: 'abc-12345678.pdf' })
})

test('parseSharePath rejects an open-redirect host as a key', () => {
  expect(parseSharePath('/evil.example.com/x')).toBeNull()
})

test('landing preview uses absolute og image and url', () => {
  const preview = landingPreview(ORIGIN)
  expect(preview.url).toBe(`${ORIGIN}/`)
  expect(preview.image).toBe(`${ORIGIN}/og.png`)
  expect(preview.title).toContain('Send a file. Keep it yours.')
})

test('injector writes escaped filename, og:image and twitter:card', () => {
  const html = `<html><head><!-- preview-meta -->\n    <title>old</title>\n    <!-- /preview-meta --></head><body>spa</body></html>`
  const key = 'ybndrfg8ejkmcpqxot1uwisza345h769ybndrfg8ejkmcpqxot1u'
  const preview = previewFromMeta(ORIGIN, { ownerKey: key, fileId: 'a1-deadbeef.png' }, {
    id: 'a1-deadbeef.png',
    name: 'holiday.png',
    type: 'image/png',
    size: 12_000,
    uploadedAt: '2026-09-05T00:00:00.000Z',
  })

  const out = applyPreview(html, preview)
  expect(out).toContain('twitter:card')
  expect(out).toContain('summary_large_image')
  expect(out).toContain('holiday.png')
  expect(out).toContain('og:image')
  expect(out).toContain(`pubky-host=${key}`)
  expect(out).toContain('spa')
})

test('filename with a script tag is escaped in OG tags', () => {
  const html = `<html><head><!-- preview-meta -->\n    <title>old</title>\n    <!-- /preview-meta --></head></html>`
  const key = 'ybndrfg8ejkmcpqxot1uwisza345h769ybndrfg8ejkmcpqxot1u'
  const preview = previewFromMeta(ORIGIN, { ownerKey: key, fileId: 'a1-deadbeef' }, {
    id: 'a1-deadbeef',
    name: `photo<script>alert(1)</script>.png`,
    type: 'application/pdf',
    size: 180_000,
    uploadedAt: '2026-09-05T00:00:00.000Z',
  })

  const out = applyPreview(html, preview)
  expect(out).not.toContain('<script>alert(1)</script>')
  expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(out).toContain(`${ORIGIN}/og.png`)
  expect(out).toContain('twitter:card')
})

test('escapeHtml covers quotes used in meta content attributes', () => {
  expect(escapeHtml(`a"b'c`)).toBe('a&quot;b&#039;c')
  const head = previewHead(brandedSharePreview(ORIGIN, {
    ownerKey: 'ybndrfg8ejkmcpqxot1uwisza345h769ybndrfg8ejkmcpqxot1u',
    fileId: 'x',
  }))
  expect(head).toContain('twitter:card')
  expect(head).toContain('summary_large_image')
})
