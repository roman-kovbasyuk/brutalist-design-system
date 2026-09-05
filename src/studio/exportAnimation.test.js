import { afterEach, describe, expect, test, vi } from 'vitest'
import { createAnimatedBannerHtml } from './exportAnimation.js'

// Vitest's default CSS stub also covers ?raw imports; use the actual authored stylesheet here.
vi.mock('./banner-templates.css?raw', async () => ({
  default: (await import('node:fs')).readFileSync('src/studio/banner-templates.css', 'utf8'),
}))

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])
const font = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 2, 3])
const readBlob = (blob) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsText(blob) })
function mockAssets() {
  const fetcher = vi.fn(async (url) => ({ ok: true, headers: new Headers(), arrayBuffer: async () => (url.includes('.woff2') ? font : png).buffer }))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
afterEach(() => vi.unstubAllGlobals())

describe('standalone animation draft export', () => {
  test.each(['editorial-split', 'product-spotlight', 'bold-announcement'])('embeds %s with image, fonts, motion and explicit draft status', async (templateId) => {
    const fetcher = mockAssets()
    const blob = await createAnimatedBannerHtml({ templateId, ratioId: 'story', imageUrl: 'blob:http://localhost:3000/test-image' })
    const html = await readBlob(blob)
    const document = new DOMParser().parseFromString(html, 'text/html')
    expect(blob.type).toBe('text/html;charset=utf-8')
    expect(document.querySelector('h1').textContent).toBe('Animation draft · Not reviewed')
    expect(document.querySelector('svg').getAttribute('viewBox')).toBe('0 0 1080 1920')
    expect(document.querySelector('image').getAttribute('href')).toMatch(/^data:image\/png;base64,/)
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('link')).toBeNull()
    expect(html).toContain('prefers-reduced-motion')
    expect(html).toContain('@keyframes studio-banner-photo')
    expect(html.match(/data:font\/woff2;base64/g)).toHaveLength(3)
    expect(html).not.toContain('blob:http')
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
  test('escapes content and never emits executable markup from copy', async () => {
    mockAssets()
    const html = await readBlob(await createAnimatedBannerHtml({ headline: '</style><script>alert(1)</script>', body: '<img src=x onerror=alert(1)>', cta: 'A & B' }))
    const document = new DOMParser().parseFromString(html, 'text/html')
    expect(document.querySelectorAll('script, img')).toHaveLength(0)
    expect(document.querySelector('.studio-banner__text').textContent).toBe('</style><script>alert(1)</script>')
    expect(document.querySelector('meta[http-equiv]').content).toContain("default-src 'none'")
  })
  test.each(['https://remote.example/photo.png', '//remote.example/photo.png', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>'])('rejects remote or active image URL %s before any request', async (imageUrl) => {
    const fetcher = mockAssets()
    await expect(createAnimatedBannerHtml({ imageUrl })).rejects.toThrow('local images only')
    expect(fetcher).not.toHaveBeenCalled()
  })
  test('rejects unknown template/ratio and unsupported image bytes', async () => {
    mockAssets()
    await expect(createAnimatedBannerHtml({ templateId: 'untrusted' })).rejects.toThrow('bundled animation templates')
    await expect(createAnimatedBannerHtml({ ratioId: 'giant' })).rejects.toThrow('supported animation format')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => new TextEncoder().encode('<svg/>').buffer })))
    await expect(createAnimatedBannerHtml()).rejects.toThrow(/PNG or JPEG|bundled font/)
  })
})
