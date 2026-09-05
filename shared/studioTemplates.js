// One geometry source for animated previews and immutable PNG exports.
const box = (x, y, width, height) => ({ x, y, width, height })
const placements = (square, portrait, story, landscape) => ({ square, portrait, story, landscape })
export const studioRatios = [
  { id: 'square', width: 1080, height: 1080 },
  { id: 'portrait', width: 1080, height: 1350 },
  { id: 'story', width: 1080, height: 1920 },
  { id: 'landscape', width: 1200, height: 628 },
].map((ratio) => ({ ...ratio, safeArea: { top: 48, right: 48, bottom: 48, left: 48 } }))

const text = (id, fontSize, fontWeight, limits, positions) => ({
  id, type: id === 'cta' ? 'cta' : 'text', required: true,
  fontFamily: 'Inter', fontWeight, fontSize, minFontSize: fontSize,
  maxCharacters: limits[0], maxLines: limits[1], placements: positions,
})
const photo = (positions) => ({
  id: 'image', type: 'image', required: true, minWidth: 800, minHeight: 800,
  acceptedMimeTypes: ['image/jpeg', 'image/png'], placements: positions,
})
const shape = (type, fill, positions) => ({ type, fill, placements: positions })
const ctaBacking = (positions, fill) => shape('rect', fill, Object.fromEntries(
  Object.entries(positions).map(([id, p]) => [id, box(p.x - 24, p.y - 12, p.width + 48, p.height + 24)]),
))

const editorialCta = placements(box(88, 800, 330, 40), box(88, 545, 330, 40), box(88, 680, 330, 40), box(88, 480, 330, 40))
const spotlightCta = placements(box(88, 946, 330, 40), box(88, 1200, 330, 40), box(88, 1720, 330, 40), box(88, 478, 330, 40))
const announcementCta = placements(box(88, 898, 350, 40), box(88, 1180, 350, 40), box(88, 1738, 350, 40), box(88, 490, 350, 40))

export const studioTemplates = [
  {
    id: 'editorial-split', version: '1.0.0', name: 'Editorial split', ratios: studioRatios,
    presentation: {
      backgroundColor: '#F4EFE5', slotColors: { headline: '#183D36', body: '#183D36', cta: '#FFFFFF' },
      shapes: [
        shape('rect', '#C2D8C7', placements(box(550, 0, 530, 1080), box(0, 670, 1080, 680), box(0, 900, 1080, 1020), box(670, 0, 530, 628))),
        shape('ellipse', '#D8A154', placements(box(440, 80, 150, 150), box(862, 530, 140, 140), box(836, 720, 180, 180), box(586, 42, 120, 120))),
        ctaBacking(editorialCta, '#183D36'),
      ],
    },
    slots: [
      text('headline', 64, 700, [80, 4], placements(box(64, 134, 446, 320), box(64, 92, 900, 246), box(64, 152, 900, 310), box(64, 60, 570, 310))),
      text('body', 28, 400, [160, 5], placements(box(64, 508, 420, 190), box(64, 352, 850, 156), box(64, 490, 850, 150), box(64, 350, 570, 112))),
      text('cta', 26, 600, [24, 1], editorialCta),
      photo(placements(box(582, 284, 466, 676), box(64, 720, 952, 566), box(64, 960, 952, 832), box(704, 156, 464, 440))),
    ],
  },
  {
    id: 'product-spotlight', version: '1.0.0', name: 'Product spotlight', ratios: studioRatios,
    presentation: {
      backgroundColor: '#DDEAFF', slotColors: { headline: '#172F6E', body: '#172F6E', cta: '#FFFFFF' },
      shapes: [
        shape('ellipse', '#AAC8F8', placements(box(510, 30, 510, 510), box(450, 70, 580, 580), box(380, 180, 650, 650), box(760, 20, 420, 420))),
        shape('rect', '#172F6E', placements(box(64, 576, 88, 8), box(64, 775, 88, 8), box(64, 1160, 88, 8), box(64, 55, 88, 8))),
        ctaBacking(spotlightCta, '#172F6E'),
      ],
    },
    slots: [
      photo(placements(box(64, 48, 816, 486), box(64, 64, 816, 662), box(64, 140, 860, 920), box(674, 72, 478, 484))),
      text('headline', 64, 700, [80, 4], placements(box(64, 614, 936, 164), box(64, 818, 936, 232), box(64, 1210, 936, 310), box(64, 104, 566, 310))),
      text('body', 28, 400, [160, 5], placements(box(64, 794, 936, 120), box(64, 1055, 936, 120), box(64, 1530, 936, 150), box(64, 365, 560, 100))),
      text('cta', 26, 600, [24, 1], spotlightCta),
    ],
  },
  {
    id: 'bold-announcement', version: '1.0.0', name: 'Bold announcement', ratios: studioRatios,
    presentation: {
      backgroundColor: '#ED644B', slotColors: { headline: '#251E1C', body: '#251E1C', cta: '#FFFFFF' },
      shapes: [
        shape('rect', '#FBEFD6', placements(box(590, 220, 442, 600), box(64, 620, 952, 490), box(64, 855, 952, 780), box(752, 48, 400, 532))),
        shape('ellipse', '#FFD17D', placements(box(738, 50, 244, 244), box(822, 458, 192, 192), box(796, 635, 220, 220), box(617, 64, 176, 176))),
        ctaBacking(announcementCta, '#251E1C'),
      ],
    },
    slots: [
      text('headline', 72, 700, [80, 4], placements(box(64, 100, 505, 350), box(64, 92, 928, 265), box(64, 164, 930, 350), box(64, 76, 654, 300))),
      text('body', 28, 400, [160, 5], placements(box(64, 545, 440, 210), box(64, 380, 865, 170), box(64, 565, 855, 190), box(64, 372, 645, 100))),
      text('cta', 26, 600, [24, 1], announcementCta),
      photo(placements(box(622, 252, 378, 536), box(96, 652, 888, 426), box(96, 887, 888, 716), box(784, 80, 336, 468))),
    ],
  },
]

export const studioTemplateSamples = {
  'editorial-split': { headline: 'A little more quiet.', body: 'Make room for the sounds you love. Thoughtfully made for your everyday.', cta: 'Find your focus' },
  'product-spotlight': { headline: 'Your world. In full sound.', body: 'Immersive listening. All-day comfort. A new rhythm for every day.', cta: 'Meet your headphones' },
  'bold-announcement': { headline: 'Turn up your everyday.', body: 'Fresh color. Serious sound. Discover your next favorite pair.', cta: 'Explore the collection' },
}
