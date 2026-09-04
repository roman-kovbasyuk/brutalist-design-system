import { createHash } from 'node:crypto'

export function canonicalJson(value) {
  return serialize(value, new Set())
}

export function hashCanonical(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function serialize(value, ancestors) {
  if (value === null) return 'null'

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON requires finite numbers')
    return JSON.stringify(value)
  }

  if (typeof value !== 'object') {
    throw new TypeError(`Canonical JSON does not support ${typeof value}`)
  }

  if (ancestors.has(value)) throw new TypeError('Canonical JSON does not support circular structures')
  ancestors.add(value)

  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => serialize(item, ancestors)).join(',')}]`
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError('Canonical JSON supports plain objects only')
    }

    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialize(value[key], ancestors)}`)
      .join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}
