import { expect, test } from 'bun:test'
import { timestampId } from './share'

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Byte-oriented Crockford base32, the inverse of what timestampId writes. */
function decodeMicros(id: string): bigint {
  let bits = 0
  let buffer = 0
  const bytes: number[] = []

  for (const char of id) {
    buffer = (buffer << 5) | CROCKFORD.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n)
}

test('an id is 13 Crockford characters', () => {
  const id = timestampId()
  expect(id).toHaveLength(13)
  expect(id).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{13}$/)
})

test('an id decodes back to the instant it was made', () => {
  const before = Date.now()
  const id = timestampId()
  const after = Date.now()

  const millis = Number(decodeMicros(id) / 1000n)
  expect(millis).toBeGreaterThanOrEqual(before)
  expect(millis).toBeLessThanOrEqual(after)
})

/**
 * The bug this guards: an arithmetic base-32 conversion also yields 13 valid
 * characters, so nothing looks wrong — the id just decodes to an instant off
 * by a factor of two, and the indexer silently drops the post. This fixture
 * pins the byte-oriented encoding.
 */
test('encodes the 8 big-endian bytes, not the integer in base 32', () => {
  const id = timestampId()
  const arithmetic = (micros: bigint) => {
    let out = ''
    let value = micros
    while (value > 0n) {
      out = CROCKFORD[Number(value % 32n)] + out
      value /= 32n
    }
    return out.padStart(13, '0')
  }

  expect(id).not.toBe(arithmetic(decodeMicros(id)))
})

test('two ids made in the same millisecond stay distinct and ordered', () => {
  const ids = [timestampId(), timestampId(), timestampId()]
  expect(new Set(ids).size).toBe(3)
  expect([...ids].sort()).toEqual(ids)
})
