import type { Path, Session } from '@synonymdev/pubky'
import { PUBKY_APP_POSTS_DIR } from './config'

/**
 * Announce a file on pubky.app by writing a post to the user's own homeserver.
 *
 * There is no pubky.app API to call: a post IS a JSON object at a canonical
 * path, which the Nexus indexer picks up from the homeserver's event stream.
 * Publishing is therefore just a `putJson` into the user's storage — which is
 * exactly why the capability we request is `/pub/pubky.app/posts/:rw` and
 * nothing wider.
 *
 * Shape per pubky-app-specs `PubkyAppPost`:
 *   content     required, <= 2000 characters for kind "short"
 *   kind        "short"
 *   parent, embed, attachments, lock   optional, and omitted entirely here
 */

const MAX_SHORT_CONTENT = 2000

export interface PostedShare {
  postId: string
  path: string
}

export async function shareOnPubkyApp(
  session: Session,
  message: string,
): Promise<PostedShare> {
  const content = message.trim()
  if (!content) throw new Error('Write something to post.')
  if (content.length > MAX_SHORT_CONTENT) {
    throw new Error(`A short post is limited to ${MAX_SHORT_CONTENT} characters.`)
  }

  const postId = timestampId()
  const path = `${PUBKY_APP_POSTS_DIR}${postId}` as Path

  // Optional fields are OMITTED, not sent as null. That is the shape genuine
  // pubky.app posts have on the homeserver — checked against real ones.
  await session.storage.putJson(path, {
    content,
    kind: 'short',
  })

  return { postId, path }
}

/**
 * Timestamp ID, per pubky-app-specs: Crockford base32 of the creation time in
 * MICROseconds — and specifically the base32 of its 8 BIG-ENDIAN BYTES, not an
 * arithmetic base-32 conversion of the number.
 *
 * The distinction is the whole bug this replaces. `validate_crockford_id`
 * requires the 13 characters to decode to exactly 8 bytes, so the 64 bits are
 * consumed from the top in groups of five and the last group is padded with a
 * trailing zero bit. Dividing the integer by 32 repeatedly aligns the value at
 * the other end and yields an id that is off by a factor of two — 13 valid
 * characters that decode to the wrong instant. Nothing rejects the write: the
 * homeserver stores any JSON. The post simply never appears, because the
 * indexer discards it.
 *
 * Measured: real pubky.app posts decode to plausible dates under this
 * encoding, and to nonsense under the arithmetic one.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
let lastMicros = 0

export function timestampId(): string {
  let micros = Date.now() * 1000
  // Date.now() has millisecond resolution, so two posts in the same
  // millisecond would collide. The counter keeps them distinct and ordered.
  if (micros <= lastMicros) micros = lastMicros + 1
  lastMicros = micros

  const bytes = new Uint8Array(8)
  let value = BigInt(micros)
  for (let i = 7; i >= 0; i -= 1) {
    bytes[i] = Number(value & 0xffn)
    value >>= 8n
  }

  let bits = 0
  let buffer = 0
  let out = ''

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += CROCKFORD[(buffer >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += CROCKFORD[(buffer << (5 - bits)) & 31]

  return out
}

/** The default message offered in the share sheet. */
export function defaultShareMessage(fileName: string, url: string) {
  return `${fileName}\n\n${url}`
}
