import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { hashCanonical } from '../../shared/canonicalJson.js'
import { templateManifestSchema } from '../../shared/templateManifest.js'
import { decodeGeneratedImage } from '../images/imageDecoder.js'

const require = createRequire(import.meta.url)
const fontFiles = Object.freeze({
  400: require.resolve('inter-ui/web/Inter-Regular.woff2'),
  600: require.resolve('inter-ui/web/Inter-SemiBold.woff2'),
  700: require.resolve('inter-ui/web/Inter-Bold.woff2'),
})
const supportedWeights = new Set(Object.keys(fontFiles).map(Number))

export class RendererError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RendererError'
    this.code = code
  }
}

function fail(code, message) {
  throw new RendererError(code, message)
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function roundCoordinate(value) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

async function loadFonts(paths) {
  return Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([weight, path]) => [
    weight,
    (await readFile(path)).toString('base64'),
  ])))
}

function fontCss(font) {
  return `@font-face{font-family:BundledInter;src:url(data:font/woff2;base64,${font})}`
}

function textLayer({ lines, placement, fontSize, font, fill = '#111827' }) {
  const lineHeight = Math.ceil(fontSize * 1.2)
  const text = lines.map((line, index) => line.length === 0 ? '' : (
    `<text x="2" y="${fontSize + index * lineHeight}" font-family="BundledInter" font-size="${fontSize}" fill="${fill}">${escapeXml(line)}</text>`
  )).join('')
  return Buffer.from(`<svg width="${placement.width}" height="${placement.height}" xmlns="http://www.w3.org/2000/svg"><style>${fontCss(font)}</style>${text}</svg>`)
}

export function createInProcessRenderer({ resolvedFontFiles = fontFiles } = {}) {
  const fontPromise = loadFonts(resolvedFontFiles)
  const measurements = new Map()

  async function measure(value, fontSize, fontWeight) {
    if (value.length === 0) return 0
    const key = `${fontWeight}:${fontSize}:${value}`
    if (measurements.has(key)) return measurements.get(key)
    const fonts = await fontPromise
    const width = Math.max(16, Math.ceil(value.length * fontSize * 1.5) + 8)
    const height = Math.ceil(fontSize * 1.5)
    const input = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>${fontCss(fonts[fontWeight])}</style><text x="2" y="${fontSize}" font-family="BundledInter" font-size="${fontSize}">${escapeXml(value)}</text></svg>`)
    const { info } = await sharp(input)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true })
    measurements.set(key, info.width)
    return info.width
  }

  async function wrapText(value, slot, placement) {
    const lines = []
    const normalized = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
    for (const paragraph of normalized.split('\n')) {
      const words = paragraph.trim().split(/[\t\f\v ]+/).filter(Boolean)
      if (words.length === 0) {
        lines.push('')
        continue
      }
      let line = ''
      for (const word of words) {
        if (await measure(word, slot.fontSize, slot.fontWeight) > placement.width) {
          fail('unbreakable_overflow', `Slot ${slot.id} contains a word wider than its placement`)
        }
        const candidate = line ? `${line} ${word}` : word
        if (await measure(candidate, slot.fontSize, slot.fontWeight) <= placement.width) line = candidate
        else {
          lines.push(line)
          line = word
        }
      }
      lines.push(line)
    }
    if (lines.length > slot.maxLines) fail('line_overflow', `Slot ${slot.id} exceeds its line limit`)
    if (lines.length * Math.ceil(slot.fontSize * 1.2) > placement.height) {
      fail('line_overflow', `Slot ${slot.id} text exceeds its placement height`)
    }
    return lines
  }

  return Object.freeze({
    async renderComposition(input) {
      if (!plainObject(input) || Object.keys(input).some((key) => !['manifest', 'slots', 'ratio'].includes(key))) {
        fail('invalid_input', 'Renderer input is invalid')
      }
      const parsed = templateManifestSchema.safeParse(input.manifest)
      if (!parsed.success) fail('invalid_manifest', 'Template manifest is invalid')
      const manifest = parsed.data
      if (typeof input.ratio !== 'string') fail('unsupported_ratio', 'Render ratio is unsupported')
      const ratio = manifest.ratios.find((candidate) => candidate.id === input.ratio)
      if (!ratio) fail('unsupported_ratio', `Render ratio ${input.ratio} is unsupported`)
      if (!plainObject(input.slots)) fail('invalid_input', 'Render slots are invalid')

      const slotDefinitions = new Map(manifest.slots.map((slot) => [slot.id, slot]))
      for (const slotId of Object.keys(input.slots)) {
        if (!slotDefinitions.has(slotId)) fail('unknown_slot', `Unknown render slot ${slotId}`)
      }

      const fonts = await fontPromise
      const compiledSlots = []
      const composites = []
      for (const slot of manifest.slots) {
        const value = input.slots[slot.id]
        if (slot.required && (value == null || typeof value === 'string' && value.trim().length === 0)) {
          fail('missing_slot', `Missing required render slot ${slot.id}`)
        }
        if (value == null) continue
        const placement = slot.placements[ratio.id]

        if (slot.type === 'image') {
          if (!plainObject(value) || Object.keys(value).some((key) => !['bytes', 'mimeType'].includes(key))) {
            fail('unsupported_image', `Image slot ${slot.id} is invalid`)
          }
          if (!slot.acceptedMimeTypes.includes(value.mimeType)) fail('unsupported_image', `Image slot ${slot.id} MIME type is unsupported`)
          const decoded = await decodeGeneratedImage(value.bytes, value.mimeType)
          if (!decoded || decoded.width < slot.minWidth || decoded.height < slot.minHeight) {
            fail('unsupported_image', `Image slot ${slot.id} bytes or dimensions are invalid`)
          }
          const sourceBytes = Buffer.from(decoded.bytes)
          const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex')
          const scale = Math.max(placement.width / decoded.width, placement.height / decoded.height)
          const crop = {
            x: roundCoordinate((decoded.width - placement.width / scale) / 2),
            y: roundCoordinate((decoded.height - placement.height / scale) / 2),
            width: roundCoordinate(placement.width / scale),
            height: roundCoordinate(placement.height / scale),
          }
          const image = await sharp(sourceBytes).resize(placement.width, placement.height, {
            fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3,
          }).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, progressive: false }).toBuffer()
          composites.push({ input: image, left: placement.x, top: placement.y })
          compiledSlots.push({
            id: slot.id, type: 'image', placement,
            source: { mimeType: decoded.mimeType, width: decoded.width, height: decoded.height, sha256: sourceSha256 },
            crop,
          })
          continue
        }

        if (typeof value !== 'string') fail('invalid_input', `Text slot ${slot.id} must be a string`)
        if (value.length > slot.maxCharacters) fail('character_limit', `Slot ${slot.id} exceeds its character limit`)
        if (slot.fontFamily !== 'Inter' || !supportedWeights.has(slot.fontWeight) || !fonts[slot.fontWeight]) {
          fail('unsupported_font', `Slot ${slot.id} font is unsupported`)
        }
        if (slot.fontSize < slot.minFontSize) fail('minimum_font_size', `Slot ${slot.id} is below its minimum font size`)
        const lines = await wrapText(value, slot, placement)
        composites.push({
          input: textLayer({ lines, placement, fontSize: slot.fontSize, font: fonts[slot.fontWeight] }),
          left: placement.x,
          top: placement.y,
        })
        compiledSlots.push({
          id: slot.id, type: slot.type, lines, placement,
          font: { family: 'Inter', weight: slot.fontWeight, size: slot.fontSize },
        })
      }

      const output = await sharp({ create: { width: ratio.width, height: ratio.height, channels: 4, background: '#ffffff' } })
        .composite(composites)
        .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, progressive: false })
        .toBuffer()
      const sha256 = createHash('sha256').update(output).digest('hex')
      const renderManifest = {
        schemaVersion: 1,
        template: { id: manifest.id, version: manifest.version, sha256: hashCanonical(manifest) },
        ratio: ratio.id,
        canvas: { width: ratio.width, height: ratio.height },
        slots: compiledSlots,
        output: { mimeType: 'image/png', width: ratio.width, height: ratio.height, byteSize: output.length, sha256 },
      }
      return {
        bytes: Buffer.from(output), mimeType: 'image/png', width: ratio.width, height: ratio.height,
        byteSize: output.length, sha256, renderManifest,
      }
    },
  })
}

const defaultRenderer = createInProcessRenderer()
export const renderComposition = (input) => defaultRenderer.renderComposition(input)
