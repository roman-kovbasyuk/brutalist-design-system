export const pilotTemplateFixture = {
  id: 'split-focus',
  version: '1.0.0',
  name: 'Split focus',
  ratios: [
    {
      id: 'square',
      width: 1080,
      height: 1080,
      safeArea: { top: 72, right: 72, bottom: 72, left: 72 },
    },
  ],
  slots: [
    {
      id: 'headline',
      type: 'text',
      required: true,
      maxCharacters: 80,
      maxLines: 2,
      fontFamily: 'Inter',
      fontWeight: 700,
      fontSize: 64,
      minFontSize: 48,
      placements: {
        square: { x: 72, y: 104, width: 500, height: 180 },
      },
    },
    {
      id: 'body',
      type: 'text',
      required: true,
      maxCharacters: 160,
      maxLines: 3,
      fontFamily: 'Inter',
      fontWeight: 400,
      fontSize: 32,
      minFontSize: 24,
      placements: {
        square: { x: 72, y: 312, width: 480, height: 180 },
      },
    },
    {
      id: 'cta',
      type: 'cta',
      required: true,
      maxCharacters: 80,
      maxLines: 1,
      fontFamily: 'Inter',
      fontWeight: 600,
      fontSize: 28,
      minFontSize: 24,
      placements: {
        square: { x: 72, y: 536, width: 360, height: 72 },
      },
    },
    {
      id: 'image',
      type: 'image',
      required: true,
      minWidth: 800,
      minHeight: 800,
      acceptedMimeTypes: ['image/jpeg', 'image/png'],
      placements: {
        square: { x: 576, y: 0, width: 504, height: 1080 },
      },
    },
  ],
}
