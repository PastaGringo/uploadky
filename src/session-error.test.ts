import { expect, test } from 'bun:test'
import { isMissingSessionError } from './pubky'

/** Shape the SDK produces: the status lives under `data`. */
const sdkError = (statusCode: number, message = 'Request failed') => {
  const error = new Error(message)
  ;(error as unknown as { data: unknown }).data = { statusCode }
  return error
}

test('a 401 is a missing credential', () => {
  expect(isMissingSessionError(sdkError(401, 'No authenticated session found'))).toBe(true)
})

test('the homeserver wording alone is enough', () => {
  expect(isMissingSessionError(new Error('No authenticated session found'))).toBe(true)
})

/**
 * The witness. A 404 is an account that has uploaded nothing, and a 403 is a
 * capability the user did not grant — neither means the cookie went missing,
 * and treating them as such would sign a working session out.
 */
test('a 404 or a 403 is not', () => {
  expect(isMissingSessionError(sdkError(404))).toBe(false)
  expect(isMissingSessionError(sdkError(403, 'Forbidden'))).toBe(false)
})
