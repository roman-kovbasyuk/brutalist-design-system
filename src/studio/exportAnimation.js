import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import regularFontUrl from 'inter-ui/display/InterDisplay-Regular.woff2?url'
import semiboldFontUrl from 'inter-ui/display/InterDisplay-SemiBold.woff2?url'
import boldFontUrl from 'inter-ui/display/InterDisplay-Bold.woff2?url'
import animationCss from './banner-templates.css?raw'
import { AnimatedBanner, studioSampleImage } from './AnimatedBanner.jsx'
import { studioTemplates, studioTemplateSamples } from '../../shared/studioTemplates.js'

const fonts = [
  ['Regular', regularFontUrl], ['SemiBold', semiboldFontUrl], ['Bold', boldFontUrl],
]
const escape = (value) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])

function localUrl(value) {
  if (typeof value !== 'string' || !value) throw new Error('Choose an image before exporting the animation draft.')
  const url = new URL(value, window.location.href)
  if (url.protocol === 'blob:' && (url.origin === window.location.origin || url.origin === 'null')) return url.href
  if (['http:', 'https:'].includes(url.protocol) && url.origin === window.location.origin) return url.href
  throw new Error('Animation drafts use local images only. Load the campaign image in the editor first.')
}

async function embedAsset(url, kind) {
  const response = await fetch(localUrl(url), { credentials: 'same-origin', redirect: 'error' })
  if (!response.ok) throw new Error(`The ${kind} could not be loaded. Please retry the animation export.`)
  const limit = kind === 'image' ? 10 * 1024 * 1024 : 1024 * 1024
  if (Number(response.headers.get('content-length')) > limit) throw new Error(`The ${kind} is too large to embed.`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length === 0 || bytes.length > limit) throw new Error(`The ${kind} is empty or too large to embed.`)
  let mimeType = 'font/woff2'
  if (kind === 'image') {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) mimeType = 'image/png'
    else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mimeType = 'image/jpeg'
    else throw new Error('Use a PNG or JPEG image for the animation draft.')
  } else if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'wOF2') {
    throw new Error('The bundled font could not be read. Please reload the app.')
  }
  let binary = ''
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192))
  return `data:${mimeType};base64,${btoa(binary)}`
}

/** Returns a standalone text/html Blob. This is an unapproved draft, never an approved delivery artifact. */
export async function createAnimatedBannerHtml({
  templateId = 'editorial-split', headline, body, cta, tag = '', imageUrl = studioSampleImage, ratioId = 'square',
} = {}) {
  const template = studioTemplates.find((item) => item.id === templateId)
  if (!template) throw new Error('Choose one of the bundled animation templates.')
  const ratio = template.ratios.find((item) => item.id === ratioId)
  if (!ratio) throw new Error('Choose a supported animation format.')
  const defaults = studioTemplateSamples[template.id]
  const values = { headline: headline ?? defaults.headline, body: body ?? defaults.body, cta: cta ?? defaults.cta, tag }
  if (typeof tag !== 'string' || tag.length > 40) throw new Error('The tag must be text of no more than 40 characters.')
  for (const field of ['headline', 'body', 'cta']) {
    if (typeof values[field] !== 'string' || values[field].length > 2000) throw new Error(`The ${field} must be text of no more than 2,000 characters.`)
  }
  // Validate the supplied image before fetching even bundled assets. Remote URLs never trigger requests.
  localUrl(imageUrl)
  const [imageData, ...fontData] = await Promise.all([
    embedAsset(imageUrl, 'image'), ...fonts.map(([, url]) => embedAsset(url, 'font')),
  ])
  let css = animationCss
  for (const [index, [name]] of fonts.entries()) {
    css = css.replaceAll(`url('inter-ui/display/InterDisplay-${name}.woff2')`, `url('${fontData[index]}')`)
  }
  const markup = renderToStaticMarkup(createElement(AnimatedBanner, {
    templateId, ratioId, ...values, imageUrl: imageData, playing: true,
  }))
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escape(template.name)} — animation draft</title>
<style>${css}
body{margin:0;padding:24px;background:#f4f4f0;color:#222;font-family:'Studio Banner Inter',sans-serif}
main{max-width:800px;margin:0 auto}h1{font-size:18px;font-weight:600;margin:0 0 8px}p{font-size:13px;line-height:1.5;margin:0 0 20px}
.studio-banner{max-height:calc(100svh - 160px);width:100%;object-fit:contain}
@media(max-width:480px){body{padding:16px}.studio-banner{max-height:none}}
</style></head><body><main><h1>Animation draft · Not reviewed</h1>
<p>${escape(template.name)} · ${ratio.width} × ${ratio.height}. This preview is not an approved delivery. Reload to replay.</p>
${markup}</main></body></html>`
  return new Blob([html], { type: 'text/html;charset=utf-8' })
}
