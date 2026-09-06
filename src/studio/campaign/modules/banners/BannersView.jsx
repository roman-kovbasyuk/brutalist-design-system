import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Image, Send, X } from 'lucide-react'
import { AppButton } from '../../../../components/design-system/atoms/AppButton.jsx'
import { PillTabs, PillTabPanel } from '../../../../components/design-system/molecules/PillTabs.jsx'
import { SelectMenu } from '../../../../components/design-system/molecules/SelectMenu.jsx'
import { EmptyState } from '../../../../components/design-system/molecules/EmptyState.jsx'
import { SelectionTile } from '../../../../components/design-system/molecules/SelectionTile.jsx'
import { PreviewDialog } from '../../../../components/design-system/organisms/PreviewDialog.jsx'
import { AnimatedBanner } from '../../../AnimatedBanner.jsx'
import { useAssetUrl } from '../../../primitives.jsx'
import { designKey, designIdentity, addDesigns, toggleDesign, resolvePair, selectionFromComposition, availableFormats, previewRatioFor } from './bannerSelection.js'
import { bannerFormats } from '../../../../../shared/bannerFormats.js'
import './banners.css'

const tabs = ['Design', 'Sizes & formats']
const categories = { 'All formats': null, 'Social media': 'social', 'Google Ads': 'google-ads', Stories: 'stories', Video: 'video' }
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const sizeLabel = size => `${size.name} · ${size.width} × ${size.height}`
const noop = () => {}

function Filter({ label, value, options, onChange, disabled }) {
  const id = useId()
  return <div className="bs-banner-filter"><label htmlFor={id}>{label}</label><SelectMenu triggerId={id} label={label}
    triggerLabel={label} value={value} options={options} onChange={onChange} disabled={disabled} /></div>
}

function SelectionTotal({ designs, sizes }) {
  return <div className="bs-banner-total" role="status" aria-label="Banner selection total">
    <span className="bs-banner-total__circle">{designs * sizes}</span>
    <div><strong>{plural(designs, 'design')} × {plural(sizes, 'size')}</strong><span>Banners to prepare</span></div>
  </div>
}

export function BannersView({ input, inputKey, assets, pending, readOnly, onSave, onPrepareReview, onLoadTemplate, onNext, onDirty = noop, heading = false, requestedTemplate }) {
  const { composition, copies = [], directions = [] } = input
  // A library choice leads the gallery without changing an existing selection.
  const templates = useMemo(() => [...input.templates].sort((a, b) => Number(b.id === requestedTemplate) - Number(a.id === requestedTemplate)), [input.templates, requestedTemplate])
  const [tab, setTab] = useState(tabs[0])
  const [copyId, setCopyId] = useState(input.selectedCopy?.id ?? copies[0]?.id ?? '')
  const [directionId, setDirectionId] = useState(input.selectedDirection?.id ?? directions[0]?.id ?? '')
  const [proportion, setProportion] = useState('Square')
  const [category, setCategory] = useState('All formats')
  const [selected, setSelected] = useState(() => selectionFromComposition(composition, copies, directions))
  const [ratioIds, setRatioIds] = useState(composition?.ratioIds ?? ['square'])
  const [dirty, setDirty] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [errorDetails, setErrorDetails] = useState([])
  const [historicalTemplates, setHistoricalTemplates] = useState([])
  const [templateError, setTemplateError] = useState('')
  const [templateReload, setTemplateReload] = useState(0)
  const savedSubmission = useRef(null)
  const sourceKey = useRef(inputKey)
  const id = useId()
  const busy = Boolean(pending) || submitting
  const locked = readOnly || busy
  const pair = resolvePair(copyId, directionId, copies, directions)
  const { url: imageUrl, error: imageError } = useAssetUrl(assets, pair.direction?.previewAssetId)
  const copyLabels = copies.map((copy, index) => `${index + 1}. ${copy.headline}`)
  const visualLabels = directions.map((direction, index) => `${index + 1}. ${direction.title}`)
  const missingVersions = [...new Map(selected.filter(design => !templates.some(template => template.id === design.templateId && template.version === design.templateVersion))
    .map(design => [`${design.templateId}@${design.templateVersion}`, [design.templateId, design.templateVersion]])).values()]
  const missingVersionKey = JSON.stringify(missingVersions)
  const templateDetailsMissing = Boolean(onLoadTemplate) && missingVersions.some(([id, version]) => !historicalTemplates.some(template => template.id === id && template.version === version))
  useEffect(() => {
    let active = true
    setTemplateError('')
    if (!missingVersions.length) { setHistoricalTemplates([]); return }
    if (!onLoadTemplate) return
    Promise.all(missingVersions.map(([id, version]) => onLoadTemplate(id, version))).then(values => {
      if (active) setHistoricalTemplates(values)
    }).catch(() => { if (active) setTemplateError('Saved template details could not load. Retry before changing their sizes.') })
    return () => { active = false }
  }, [missingVersionKey, onLoadTemplate, templateReload])
  const knownTemplates = useMemo(() => [...templates, ...historicalTemplates], [templates, historicalTemplates])
  const catalog = useMemo(() => {
    const entries = new Map(bannerFormats.map(format => [format.id, format]))
    for (const template of knownTemplates) for (const ratio of template.manifest.ratios) {
      if (!entries.has(ratio.id)) entries.set(ratio.id, { ...ratio, name: ratio.id, categories: [] })
    }
    return [...entries.values()]
  }, [knownTemplates])
  const supported = availableFormats(catalog, knownTemplates, selected, composition)
  const supportedIds = new Set(supported.map(format => format.id))
  const visibleFormats = supported.filter(format => !categories[category] || format.categories.includes(categories[category]))
  const invalidSizes = ratioIds.filter(ratio => !supportedIds.has(ratio))
  const visibleDesigns = pair.copy && pair.direction ? templates.filter(template => previewRatioFor(template, proportion)).map(template => ({
    templateId: template.id, templateVersion: template.version, copySetId: pair.copy.copySetId, copyId: pair.copy.id, directionId: pair.direction.id,
  })) : []
  const allVisibleSelected = visibleDesigns.length > 0 && visibleDesigns.every(design => selected.some(item => designKey(item) === designKey(design)))
  const sourceChanged = dirty && sourceKey.current !== inputKey
  const canSubmit = !locked && selected.length > 0 && ratioIds.length > 0 && !invalidSizes.length && !sourceChanged && !templateDetailsMissing

  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  useEffect(() => {
    if (dirty || confirming) return
    sourceKey.current = inputKey
    setSelected(selectionFromComposition(composition, copies, directions))
    setRatioIds(composition?.ratioIds ?? ['square'])
    if (!copies.some(copy => copy.id === copyId)) setCopyId(input.selectedCopy?.id ?? copies[0]?.id ?? '')
    if (!directions.some(direction => direction.id === directionId)) setDirectionId(input.selectedDirection?.id ?? directions[0]?.id ?? '')
  }, [inputKey, dirty, confirming])

  function edit(next, sizes = ratioIds) {
    setSelected(next); setRatioIds(sizes); setDirty(true); setError(''); setErrorDetails([]); savedSubmission.current = null
  }
  function chooseCopy(label) {
    const copy = copies[copyLabels.indexOf(label)]
    setCopyId(copy.id)
    if (pair.direction?.copy && pair.direction.copy.id !== copy.id) {
      const compatible = directions.find(direction => direction.copy?.id === copy.id)
        ?? directions.find(direction => !direction.copy)
      setDirectionId(compatible?.id ?? '')
    }
  }
  function chooseVisual(label) {
    const direction = directions[visualLabels.indexOf(label)]
    setDirectionId(direction.id)
    if (direction.copy) setCopyId(direction.copy.id)
  }
  async function confirm() {
    if (submitting) return
    setSubmitting(true); setError(''); setErrorDetails([])
    try {
      const payload = { designs: selected.map(designIdentity), ratioIds }
      const identity = JSON.stringify(payload)
      if (savedSubmission.current?.identity !== identity) {
        const saved = await onSave(payload, { expectedInputKey: sourceKey.current })
        if (!saved?.ok) throw Object.assign(new Error(saved?.message ?? 'The selection could not be saved. Try again.'), { details: saved?.details })
        savedSubmission.current = { identity, reviewInputKey: saved.reviewInputKey }
        setDirty(false); onDirty(false)
      }
      const result = await onPrepareReview({ expectedInputKey: savedSubmission.current.reviewInputKey })
      if (!result?.ok) throw new Error(result?.message ?? 'Review preparation failed. Your selection is saved.')
      setConfirming(false); onNext()
    } catch (failure) { setError(failure.message); setErrorDetails(Array.isArray(failure.details) ? failure.details : []) }
    finally { setSubmitting(false) }
  }
  const describe = design => {
    const template = knownTemplates.find(template => template.id === design.templateId && template.version === design.templateVersion)
      ?? templates.find(template => template.id === design.templateId)
    const copy = copies.find(copy => copy.id === design.copyId)
    const visual = directions.find(direction => direction.id === design.directionId)
    return { title: `${template?.name ?? design.templateId}${template?.version !== design.templateVersion ? ` · v${design.templateVersion}` : ''}`, copy: copy?.headline ?? 'Saved copy', visual: visual?.title ?? 'Saved visual' }
  }
  const validationIssues = errorDetails.length > 0 && <ul aria-label="Banner validation issues">{errorDetails.map((detail, index) => {
    const template = knownTemplates.find(template => template.id === detail.templateId)
    const format = catalog.find(format => format.id === detail.ratioId)
    return <li key={index}><strong>{template?.name ?? detail.templateId ?? 'Selection'}{format ? ` · ${format.width} × ${format.height}` : ''}</strong><p>{detail.message}</p></li>
  })}</ul>

  return <section className="bs-banners-module" aria-label="Banners module" aria-busy={busy || undefined}>
    {heading && <h2>Banners</h2>}
    <div className="bs-banner-selection-bar"><SelectionTotal designs={selected.length} sizes={ratioIds.length} />
      {!readOnly && <AppButton variant="primary" onClick={() => { setError(''); setConfirming(true) }} disabled={!canSubmit}><Send size={18} aria-hidden="true" />Send to Figma</AppButton>}
    </div>
    <PillTabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Banner selection" idPrefix={id} />
    <PillTabPanel tab="Design" value={tab} idPrefix={id}>
      <div className="bs-banner-filters">
        <Filter label="Copy" value={copyLabels[copies.findIndex(copy => copy.id === pair.copy?.id)] ?? 'Choose copy'} options={copyLabels} onChange={chooseCopy} disabled={busy || !copies.length} />
        <Filter label="Visual" value={visualLabels[directions.findIndex(direction => direction.id === pair.direction?.id)] ?? 'Choose visual'} options={visualLabels} onChange={chooseVisual} disabled={busy || !directions.length} />
        <Filter label="Preview proportion" value={proportion} options={['Square', 'Horizontal', 'Vertical']} onChange={setProportion} disabled={busy} />
      </div>
      {pair.direction?.copy && <p className="bs-note">This visual is paired with its original copy.</p>}
      <div className="bs-banner-grid-toolbar"><span>{plural(templates.length, 'template')}</span><AppButton disabled={locked || !visibleDesigns.length}
        onClick={() => edit(allVisibleSelected ? selected.filter(item => !visibleDesigns.some(design => designKey(design) === designKey(item))) : addDesigns(selected, visibleDesigns))}>
        {allVisibleSelected ? 'Deselect visible designs' : 'Select all designs'}</AppButton></div>
      {!pair.copy || !pair.direction ? <EmptyState icon={<Image size={28} />}>Choose copy and a ready visual to preview your banners.</EmptyState>
        : <><div className="bs-banner-design-grid">{templates.map(template => {
          const ratio = previewRatioFor(template, proportion)
          if (!ratio) return <div className="bs-banner-unavailable" key={template.id}><strong>{template.name}</strong><p>No {proportion.toLowerCase()} preview available.</p></div>
          const design = { templateId: template.id, templateVersion: template.version, copySetId: pair.copy.copySetId, copyId: pair.copy.id, directionId: pair.direction.id }
          return <SelectionTile key={`${template.id}-${template.version}`} label={template.name} selected={selected.some(item => designKey(item) === designKey(design))}
            disabled={locked} onChange={() => edit(toggleDesign(selected, design))} caption={template.name}>
            <AnimatedBanner manifest={template.manifest} ratioId={ratio.id} headline={pair.copy.headline} body={pair.copy.body} cta={pair.copy.cta} tag={pair.copy.offer ?? ''} imageUrl={imageUrl ?? ''} playing={false} />
          </SelectionTile>
        })}</div>{imageError && <p className="bs-note" role="alert">The visual preview could not load. Your saved image is unchanged.</p>}</>}
      <p className="bs-note">Preview proportion only changes this grid. Choose output dimensions in Sizes &amp; formats.</p>
    </PillTabPanel>
    <PillTabPanel tab="Sizes & formats" value={tab} idPrefix={id}>
      <div className="bs-banner-size-toolbar"><Filter label="Placement category" value={category} options={Object.keys(categories)} onChange={setCategory} />
        <AppButton disabled={locked || !visibleFormats.length} onClick={() => edit(selected, [...new Set([...ratioIds, ...visibleFormats.map(format => format.id)])])}>Select all shown sizes</AppButton></div>
      <div className="bs-banner-size-grid">{visibleFormats.map(format => <SelectionTile key={format.id} label={sizeLabel(format)} selected={ratioIds.includes(format.id)} disabled={locked}
        onChange={() => edit(selected, ratioIds.includes(format.id) ? ratioIds.filter(id => id !== format.id) : [...ratioIds, format.id])}
        caption={<><strong>{format.name}</strong><small>{format.width} × {format.height}</small></>}>
        <span className="bs-banner-ratio-icon" aria-hidden="true"><svg viewBox="0 0 100 80"><rect x={(100 - 64 * Math.min(1, format.width / format.height)) / 2} y={(80 - 64 * Math.min(1, format.height / format.width)) / 2}
          width={64 * Math.min(1, format.width / format.height)} height={64 * Math.min(1, format.height / format.width)} fill="none" stroke="currentColor" strokeWidth="1" /></svg></span>
      </SelectionTile>)}</div>
      {!visibleFormats.length && <EmptyState icon={<Image size={28} />}>No compatible sizes in this category.</EmptyState>}
      <p className="bs-note">Only sizes supported by the selected designs are shown. Older saved design versions retain their saved sizes. Video placements are size presets; this review package contains static PNGs.</p>
    </PillTabPanel>
    {selected.length > 0 && <details className="bs-banner-selected"><summary>{plural(selected.length, 'selected design')}</summary><ul>{selected.map(design => {
      const item = describe(design)
      return <li key={designKey(design)}><div><strong>{item.title}</strong><span>{item.copy} · {item.visual}</span></div>
        {!readOnly && <AppButton iconOnly aria-label={`Remove ${item.title} selection`} disabled={busy} onClick={() => edit(selected.filter(item => designKey(item) !== designKey(design)))}><X size={16} aria-hidden="true" /></AppButton>}</li>
    })}</ul></details>}
    {templateDetailsMissing && !templateError && <p role="status">Loading saved template details…</p>}
    {invalidSizes.length > 0 && !templateDetailsMissing && <div className="bs-info"><p>Some selected sizes are not supported by every selected design.</p><AppButton disabled={locked} onClick={() => edit(selected, ratioIds.filter(id => supportedIds.has(id)))}>Remove unsupported sizes</AppButton></div>}
    {templateError && <div className="bs-info" role="alert"><p>{templateError}</p><AppButton onClick={() => setTemplateReload(value => value + 1)}>Retry template details</AppButton></div>}
    {sourceChanged && <div className="bs-info"><p>The source changed. Your selection is kept here; reload the saved selection before saving again.</p><AppButton disabled={busy} onClick={() => { savedSubmission.current = null; setDirty(false); onDirty(false) }}>Reload saved selection</AppButton></div>}
    {!confirming && validationIssues && <div className="bs-info" role="alert"><p>{error}</p>{validationIssues}</div>}
    {confirming && <PreviewDialog title="Verify your banners" onClose={() => { if (!submitting) setConfirming(false) }}>
      <div className="bs-banner-confirmation"><SelectionTotal designs={selected.length} sizes={ratioIds.length} />
        <h3>Designs &amp; content</h3><ul>{selected.map(design => { const item = describe(design); return <li key={designKey(design)}><strong>{item.title}</strong><span>{item.copy}</span><small>{item.visual}</small></li> })}</ul>
        <h3>Sizes &amp; formats</h3><ul>{ratioIds.map(id => { const format = catalog.find(format => format.id === id); return <li key={id}>{format ? sizeLabel(format) : id}</li> })}</ul>
        <p>We’ll prepare an immutable PNG review package. Import the PNGs into Figma, then add the Figma link in Review. Designer checks and approval are still required.</p>
        {error && <p role="alert">{error}</p>}
        {validationIssues}
        <footer><AppButton disabled={submitting} onClick={() => setConfirming(false)}>Back to selection</AppButton><AppButton variant="primary" disabled={submitting} busy={submitting} onClick={confirm}>
          {submitting ? 'Preparing review…' : savedSubmission.current ? 'Retry review preparation' : 'Confirm and prepare review'}</AppButton></footer>
      </div>
    </PreviewDialog>}
  </section>
}
