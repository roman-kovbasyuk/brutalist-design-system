import { describe, expect, it } from 'vitest'
import { designKey, toggleDesign, addDesigns, resolvePair, selectionFromComposition, availableFormats } from './bannerSelection.js'

const copy = { id: 'copy-a', copySetId: 'set-a', headline: 'One' }
const other = { id: 'copy-b', copySetId: 'set-b', headline: 'Two' }
const design = { templateId: 'editorial', templateVersion: '1', copySetId: 'set-a', copyId: 'copy-a', directionId: 'visual-a' }

describe('Banners selection model', () => {
  it('keeps different content on the same template as separate selections', () => {
    const second = { ...design, copySetId: 'set-b', copyId: 'copy-b' }
    expect(addDesigns([design], [design, second])).toEqual([design, second])
    expect(toggleDesign([design, second], design)).toEqual([second])
    expect(designKey(design)).not.toBe(designKey(second))
  })
  it('a copy-specific visual selects its linked copy, never the current unrelated copy', () => {
    const visual = { id: 'visual-a', scope: 'selected_copy', copy: other }
    expect(resolvePair(copy.id, visual.id, [copy, other], [visual])).toEqual({ copy: other, direction: visual })
    expect(resolvePair(copy.id, visual.id, [copy], [visual])).toEqual({ copy: null, direction: null })
  })
  it('campaign-wide visuals can preview either copy', () => {
    const visual = { id: 'visual-a', scope: 'campaign' }
    expect(resolvePair(other.id, visual.id, [copy, other], [visual])).toEqual({ copy: other, direction: visual })
  })
  it('restores request identities, not server-only snapshots', () => {
    const composition = { designs: [{ ...design, id: 'server-id', slotValues: { headline: 'One' } }] }
    expect(selectionFromComposition(composition, [], [])).toEqual([design])
  })
  it('only offers formats supported by every selected template and keeps category filtering separate', () => {
    const formats = [{ id: 'square', width: 1080, height: 1080, categories: ['social'] }, { id: 'story', width: 1080, height: 1920, categories: ['social', 'stories'] }]
    const templates = [{ id: 'editorial', version: '1', manifest: { ratios: [{ id: 'square' }, { id: 'story' }] } }, { id: 'limited', version: '1', manifest: { ratios: [{ id: 'square' }] } }]
    expect(availableFormats(formats, templates, [design, { ...design, templateId: 'limited' }])).toEqual([formats[0]])
    expect(availableFormats(formats, templates, [design])).toEqual(formats)
  })
  it('preserves verified saved sizes for a historical template absent from the latest catalog', () => {
    const formats = [{ id: 'square' }, { id: 'story' }]
    const templates = [{ id: 'editorial', version: '2', manifest: { ratios: formats } }]
    const composition = { designs: [design], ratioIds: ['square'] }
    expect(availableFormats(formats, templates, [design], composition)).toEqual([formats[0]])
    expect(availableFormats(formats, templates, [{ ...design, copyId: 'unrelated' }], composition)).toEqual([])
  })
})
