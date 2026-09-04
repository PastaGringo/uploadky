/**
 * Inline SVG icons. Inline rather than an icon font or a sprite so they inherit
 * `currentColor` and cost no extra request.
 */

const svg = (paths: string, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
  `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

export const iconCopy = (size = 16) =>
  svg(
    '<rect x="9" y="9" width="12" height="12" rx="2"/>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    size,
  )

export const iconCheck = (size = 16) => svg('<path d="M20 6 9 17l-5-5"/>', size)

export const iconTrash = (size = 16) =>
  svg(
    '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
      '<path d="M10 11v6M14 11v6"/>',
    size,
  )

export const iconShare = (size = 16) =>
  svg(
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
      '<path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    size,
  )

export const iconUpload = (size = 26) =>
  svg(
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
      '<path d="M17 8 12 3 7 8"/><path d="M12 3v13"/>',
    size,
  )

export const iconExternal = (size = 14) =>
  svg('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>', size)

export const iconLock = (size = 14) =>
  svg('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', size)

export const iconKey = (size = 14) =>
  svg('<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2M17 6l2 2M14 9l2 2"/>', size)

export const iconExit = (size = 14) =>
  svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>', size)

/** A coarse file-kind glyph, from the MIME type. */
export function iconForType(type: string, size = 15) {
  if (type.startsWith('image/')) {
    return svg(
      '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>' +
        '<path d="m21 15-5-5L5 21"/>',
      size,
    )
  }
  if (type.startsWith('video/')) {
    return svg('<rect x="2" y="4" width="14" height="16" rx="2"/><path d="m16 12 6-4v8l-6-4Z"/>', size)
  }
  if (type.startsWith('audio/')) {
    return svg('<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>', size)
  }
  if (type.includes('zip') || type.includes('compressed') || type.includes('tar')) {
    return svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v4M12 9v2M12 13v2"/>', size)
  }
  return svg(
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
    size,
  )
}

export const iconEye = (size = 14) =>
  svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>', size)

export const iconSpark = (size = 14) =>
  svg('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3"/>', size)
