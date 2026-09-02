const definitions = [
  ['split-left', 'Split frame', 'split', 'portrait', 'left', 'balanced', 'split', 'Slide reveal', 'split-left'],
  ['split-right', 'Reverse split', 'split', 'portrait', 'right', 'balanced', 'split', 'Wipe reveal', 'split-right'],
  ['full-bleed', 'Full bleed', 'overlay', 'story', 'left', 'quiet', 'full', 'Slow push', 'full-bleed'],
  ['center-poster', 'Center poster', 'poster', 'portrait', 'center', 'balanced', 'background', 'Type stack', 'center-poster'],
  ['editorial-top', 'Editorial top', 'editorial', 'portrait', 'left', 'dense', 'window', 'Line build', 'editorial-top'],
  ['editorial-bottom', 'Editorial bottom', 'editorial', 'portrait', 'left', 'dense', 'window', 'Image rise', 'editorial-bottom'],
  ['product-stage', 'Product stage', 'product', 'portrait', 'center', 'quiet', 'window', 'Object orbit', 'product-stage'],
  ['type-led', 'Type-led', 'poster', 'story', 'left', 'dense', 'background', 'Kinetic type', 'type-led'],
  ['quiet-frame', 'Quiet frame', 'editorial', 'portrait', 'left', 'quiet', 'window', 'Soft crop', 'quiet-frame'],
  ['corner-note', 'Corner note', 'overlay', 'portrait', 'left', 'quiet', 'full', 'Corner unfold', 'corner-note'],
  ['diagonal-cut', 'Diagonal cut', 'split', 'story', 'left', 'balanced', 'split', 'Diagonal wipe', 'diagonal-cut'],
  ['stacked-cards', 'Layered cards', 'product', 'portrait', 'left', 'dense', 'window', 'Card assemble', 'stacked-cards'],
  ['floating-window', 'Floating window', 'product', 'story', 'center', 'balanced', 'window', 'Window float', 'floating-window'],
  ['headline-band', 'Headline band', 'overlay', 'portrait', 'left', 'balanced', 'full', 'Band slide', 'headline-band'],
  ['number-focus', 'Number focus', 'poster', 'portrait', 'center', 'dense', 'background', 'Count up', 'number-focus'],
  ['asymmetric-grid', 'Asymmetric grid', 'editorial', 'story', 'left', 'dense', 'split', 'Grid reflow', 'asymmetric-grid'],
  ['cinema-caption', 'Cinema caption', 'overlay', 'story', 'center', 'quiet', 'full', 'Caption pulse', 'cinema-caption'],
  ['sidebar-story', 'Vertical rhythm', 'split', 'story', 'left', 'balanced', 'window', 'Rail travel', 'sidebar-story'],
  ['offer-ticket', 'Offer ticket', 'product', 'portrait', 'center', 'dense', 'background', 'Ticket stamp', 'offer-ticket'],
  ['minimal-mark', 'Minimal mark', 'poster', 'portrait', 'center', 'quiet', 'background', 'Mark resolve', 'minimal-mark'],
]

export const templates = definitions.map((definition, index) => {
  const [id, name, family, masterRatio, alignment, density, mediaMode, motion, layout] = definition
  return {
    id,
    name,
    index: index + 1,
    family,
    masterRatio,
    alignment,
    density,
    mediaMode,
    motion,
    layout,
  }
})

export const templateFamilies = [
  { id: 'all', label: 'All' },
  { id: 'split', label: 'Split' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'poster', label: 'Poster' },
  { id: 'product', label: 'Product' },
]
