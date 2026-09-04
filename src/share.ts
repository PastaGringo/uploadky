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
 *   parent      null unless it is a reply
 *   embed       null
 *   attachments null, or a list of pubky:// URIs
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

  await session.storage.putJson(path, {
    content,
    kind: 'short',
    parent: null,
    embed: null,
    attachments: null,
  })

  return { postId, path }
}

/**
 * Timestamp ID, per pubky-app-specs: Crockford base32 of the creation time in
 * MICROseconds, 13 characters, so ids sort chronologically as strings.
 *
 * `Date.now()` only has millisecond resolution, so a counter fills the last
 * digits — two posts in the same millisecond still get distinct, ordered ids.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
let lastMicros = 0

export function timestampId(): string {
  let micros = Date.now() * 1000
  if (micros <= lastMicros) micros = lastMicros + 1
  lastMicros = micros

  let out = ''
  let value = BigInt(micros)
  const base = BigInt(32)

  while (value > 0n) {
    out = CROCKFORD[Number(value % base)] + out
    value /= base
  }

  return out.padStart(13, '0')
}

/** The default message offered in the share sheet. */
export function defaultShareMessage(fileName: string, url: string) {
  return `${fileName}\n\n${url}`
}
