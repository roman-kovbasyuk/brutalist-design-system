import { Copy as CopyIcon, LoaderCircle, Minus, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'

export function CopyWorkspace({ strategy, imagePromptCounts = [], promptGeneratingIndex = null, onImagePromptCountChange }) {
  const [options, setOptions] = useState(() => buildCopyOptions(strategy))
  const [draggingIndex, setDraggingIndex] = useState(null)

  function duplicateOption(index) {
    setOptions((current) => [...current.slice(0, index + 1), { ...current[index] }, ...current.slice(index + 1)])
  }

  function deleteOption(index) {
    setOptions((current) => current.length <= 1 ? current : current.filter((_, optionIndex) => optionIndex !== index))
  }

  function moveOption(targetIndex) {
    if (draggingIndex === null || draggingIndex === targetIndex) return
    setOptions((current) => {
      const next = [...current]
      const [moved] = next.splice(draggingIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
    setDraggingIndex(null)
  }

  function generateMoreOptions() {
    setOptions((current) => [...current, ...Array.from({ length: 5 }, (_, index) => ({
      headline: `New copy direction ${current.length + index + 1}`,
      body: 'A fresh campaign message shaped for everyday confidence and clear action.',
      cta: 'Learn more',
    }))])
  }

  return (
    <section className="copy-workbench" aria-label="Copy and shot planning">
      <div className="copy-workbench__message">
        <div className="copy-options-wrap">
          <table className="copy-options-table" aria-label="Five headline, body, and CTA options">
            <thead><tr><th scope="col">#</th><th scope="col">Headline</th><th scope="col">Body</th><th scope="col">CTA</th><th scope="col">Image prompts</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{options.map((option, index) => { const count = imagePromptCounts[index] ?? 1; const generating = promptGeneratingIndex === index; return <tr key={`${option.headline}-${index}`} draggable onDragStart={() => setDraggingIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveOption(index)} onDragEnd={() => setDraggingIndex(null)} className={draggingIndex === index ? 'copy-option-row--dragging' : ''}><th scope="row">{index + 1}</th><td contentEditable suppressContentEditableWarning>{option.headline}</td><td contentEditable suppressContentEditableWarning>{option.body}</td><td contentEditable suppressContentEditableWarning>{option.cta}</td><td className="copy-options-table__prompts"><button type="button" aria-label={`Decrease image prompts for copy ${index + 1}`} onClick={() => onImagePromptCountChange?.(index, Math.max(1, count - 1))} disabled={count <= 1 || generating}><Minus size={12} aria-hidden="true" /></button><strong aria-label={`${count} image prompts`}>{count}</strong><button type="button" aria-label={`Increase image prompts for copy ${index + 1}`} onClick={() => onImagePromptCountChange?.(index, Math.min(5, count + 1))} disabled={count >= 5 || generating}>{generating ? <LoaderCircle className="prompt-generating-spinner" size={14} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}</button></td><td className="copy-options-table__actions"><button type="button" aria-label={`Duplicate copy option ${index + 1}`} title="Duplicate" onClick={() => duplicateOption(index)}><CopyIcon size={14} aria-hidden="true" /></button><button type="button" aria-label={`Delete copy option ${index + 1}`} title="Delete" onClick={() => deleteOption(index)} disabled={options.length <= 1}><Trash2 size={14} aria-hidden="true" /></button></td></tr> })}</tbody>
          </table>
        </div>

        <div className="copy-options-more"><button type="button" className="button button--primary" onClick={generateMoreOptions}><Sparkles size={14} aria-hidden="true" />Generate 5 more</button></div>

      </div>

    </section>
  )
}

function buildCopyOptions(strategy) {
  const variants = [
    [strategy.headline, strategy.body, strategy.cta],
    ['Start speaking sooner', 'Build practical Norwegian confidence for everyday life in Oslo.', 'Explore the intensive'],
    ['Your first week, in Norwegian', 'Learn the words and confidence to make your move feel local.', 'See the course'],
    ['Move with more confidence', 'Short, focused lessons for real conversations from day one.', 'Save 15% today'],
    ['Find your voice in Oslo', 'A supportive intensive for navigating your new everyday with ease.', 'Start your journey'],
  ]
  return variants.map(([headline, body, cta]) => ({ headline, body, cta }))
}
