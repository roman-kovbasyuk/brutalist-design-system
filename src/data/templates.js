const definitions = [
  ['split-left', 'Разделение', 'split', 'portrait', 'left', 'balanced', 'split', 'Slide reveal', 'split-left'],
  ['split-right', 'Обратный сплит', 'split', 'portrait', 'right', 'balanced', 'split', 'Wipe reveal', 'split-right'],
  ['full-bleed', 'Полный кадр', 'overlay', 'story', 'left', 'quiet', 'full', 'Slow push', 'full-bleed'],
  ['center-poster', 'Центральный постер', 'poster', 'portrait', 'center', 'balanced', 'background', 'Type stack', 'center-poster'],
  ['editorial-top', 'Редакционный верх', 'editorial', 'portrait', 'left', 'dense', 'window', 'Line build', 'editorial-top'],
  ['editorial-bottom', 'Редакционный низ', 'editorial', 'portrait', 'left', 'dense', 'window', 'Image rise', 'editorial-bottom'],
  ['product-stage', 'Предметная сцена', 'product', 'portrait', 'center', 'quiet', 'window', 'Object orbit', 'product-stage'],
  ['type-led', 'Крупная типографика', 'poster', 'story', 'left', 'dense', 'background', 'Kinetic type', 'type-led'],
  ['quiet-frame', 'Тихая рамка', 'editorial', 'portrait', 'left', 'quiet', 'window', 'Soft crop', 'quiet-frame'],
  ['corner-note', 'Угловая заметка', 'overlay', 'portrait', 'left', 'quiet', 'full', 'Corner unfold', 'corner-note'],
  ['diagonal-cut', 'Диагональный срез', 'split', 'story', 'left', 'balanced', 'split', 'Diagonal wipe', 'diagonal-cut'],
  ['stacked-cards', 'Собранные слои', 'product', 'portrait', 'left', 'dense', 'window', 'Card assemble', 'stacked-cards'],
  ['floating-window', 'Плавающее окно', 'product', 'story', 'center', 'balanced', 'window', 'Window float', 'floating-window'],
  ['headline-band', 'Полоса заголовка', 'overlay', 'portrait', 'left', 'balanced', 'full', 'Band slide', 'headline-band'],
  ['number-focus', 'Цифра в фокусе', 'poster', 'portrait', 'center', 'dense', 'background', 'Count up', 'number-focus'],
  ['asymmetric-grid', 'Асимметричная сетка', 'editorial', 'story', 'left', 'dense', 'split', 'Grid reflow', 'asymmetric-grid'],
  ['cinema-caption', 'Кино-титр', 'overlay', 'story', 'center', 'quiet', 'full', 'Caption pulse', 'cinema-caption'],
  ['sidebar-story', 'Вертикальный ритм', 'split', 'story', 'left', 'balanced', 'window', 'Rail travel', 'sidebar-story'],
  ['offer-ticket', 'Оффер-билет', 'product', 'portrait', 'center', 'dense', 'background', 'Ticket stamp', 'offer-ticket'],
  ['minimal-mark', 'Минимальный знак', 'poster', 'portrait', 'center', 'quiet', 'background', 'Mark resolve', 'minimal-mark'],
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
  { id: 'all', label: 'Все' },
  { id: 'split', label: 'Split' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'poster', label: 'Poster' },
  { id: 'product', label: 'Product' },
]
