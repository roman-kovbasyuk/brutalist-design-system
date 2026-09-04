import { describe, expect, test } from 'vitest'
import { canonicalJson, hashCanonical } from './canonicalJson.js'

describe('canonicalJson', () => {
  test('sorts object keys recursively without reordering arrays', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: [3, 1] } }))
      .toBe('{"a":{"x":[3,1],"y":2},"z":1}')
  })

  test('produces the same hash for equivalent object key order', () => {
    expect(hashCanonical({ b: 2, a: 1 })).toBe(hashCanonical({ a: 1, b: 2 }))
  })

  test.each([
    ['undefined', undefined],
    ['function', () => {}],
    ['symbol', Symbol('unsupported')],
    ['non-finite number', Number.POSITIVE_INFINITY],
  ])('rejects an unsupported %s', (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError)
  })

  test('rejects circular structures', () => {
    const circular = {}
    circular.self = circular

    expect(() => canonicalJson(circular)).toThrow(TypeError)
  })
})
