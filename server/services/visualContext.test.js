import { expect, test } from 'vitest'
import { validVisualResult } from './visualContext.js'

const direction = (id, copyId) => ({ id, title: id, prompt: 'Source image', status: 'pending', previewAssetId: null, ...(copyId ? { copyId } : {}) })
test('campaign results contain exactly three distinct prompt-only directions', () => {
  const context = { mode: 'campaign' }
  expect(validVisualResult(context, [direction('a'), direction('b'), direction('c')])).toBe(true)
  expect(validVisualResult(context, [direction('a')])).toBe(false)
  expect(validVisualResult(context, [direction('a'), direction('a'), direction('c')])).toBe(false)
  expect(validVisualResult(context, [direction('a', 'copy'), direction('b'), direction('c')])).toBe(false)
  expect(validVisualResult(context, [{ ...direction('a'), previewAssetId: 'invented' }, direction('b'), direction('c')])).toBe(false)
})
test('linked results identify each requested copy exactly once, regardless of provider order', () => {
  const context = { mode: 'selected_copy', copies: [{ id: 'copy-a' }, { id: 'copy-b' }] }
  expect(validVisualResult(context, [direction('a', 'copy-b'), direction('b', 'copy-a')])).toBe(true)
  expect(validVisualResult(context, [direction('a', 'copy-a'), direction('b', 'copy-a')])).toBe(false)
  expect(validVisualResult(context, [direction('a', 'unrelated'), direction('b', 'copy-b')])).toBe(false)
  expect(validVisualResult(context, [direction('a'), direction('b')])).toBe(false)
})
