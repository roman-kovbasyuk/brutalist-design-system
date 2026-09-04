export function validateBannerRenderer(renderer) {
  if (!renderer || typeof renderer !== 'object' || typeof renderer.renderComposition !== 'function') {
    throw new TypeError('Banner renderer must implement renderComposition')
  }
  return renderer
}

export async function renderComposition(renderer, input) {
  return validateBannerRenderer(renderer).renderComposition(input)
}
