import { Check, ChevronDown, Eye, LayoutPanelTop, RectangleHorizontal, RectangleVertical, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BannerPreview } from './BannerPreview.jsx'

const formatOptions = [
  ['all', 'All'],
  ['Horizontal', 'Horizontal'],
  ['Vertical', 'Vertical'],
  ['Square', 'Square'],
]
const platformOptions = [
  ['all', 'All'],
  ['SMM Static', 'SMM Static'],
  ['Google Ads', 'Google Ads'],
  ['Video Reels', 'Video Reels'],
]
const motionOptions = {
  text: [
    ['fade-up', 'Fade up'],
    ['slide-in', 'Slide in'],
    ['type-reveal', 'Type reveal'],
  ],
  image: [
    ['soft-zoom', 'Soft zoom'],
    ['pan-up', 'Pan up'],
    ['fade-in', 'Fade in'],
  ],
  cta: [
    ['pop-in', 'Pop in'],
    ['slide-up', 'Slide up'],
    ['pulse', 'Pulse'],
  ],
}
const defaultMotion = { text: 'fade-up', image: 'soft-zoom', cta: 'pop-in', replayVersion: 0 }

export function filterBannerCandidates(candidates, filters) {
  const format = filters.format.toLowerCase()
  const platform = filters.platform.toLowerCase()
  return candidates.filter((candidate) => (
    (format === 'all' || candidate.format.toLowerCase() === format) &&
    (platform === 'all' || candidate.platform.toLowerCase() === platform) &&
    candidate.mediaType === filters.media
  ))
}

export function BannerWorkspace({
  candidates,
  templates,
  staticAssets,
  videoAssets,
  content,
  filters,
  onFiltersChange,
  selectedBannerIds,
  onSelectedBannerIdsChange,
  activeBannerId,
  onActiveBannerChange,
  motionByBannerId,
  onMotionChange,
  onReplayMotion,
}) {
  const visibleCandidates = useMemo(() => filterBannerCandidates(candidates, filters), [candidates, filters])
  const hasLinkedVideo = candidates.some((candidate) => candidate.mediaType === 'video')
  const activeCandidate = visibleCandidates.find((candidate) => candidate.id === activeBannerId) ?? null
  const templateById = useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates])
  const staticById = useMemo(() => new Map(staticAssets.map((asset) => [asset.id, asset])), [staticAssets])
  const videoById = useMemo(() => new Map(videoAssets.map((asset) => [asset.id, asset])), [videoAssets])

  useEffect(() => {
    if (!hasLinkedVideo && filters.media === 'video') {
      onFiltersChange({ media: 'static', format: 'Vertical', platform: 'SMM Static' })
    }
  }, [filters.media, hasLinkedVideo, onFiltersChange])

  function setFilter(name, value) {
    onActiveBannerChange(null)
    onFiltersChange({ ...filters, [name]: value })
  }

  function setMedia(media) {
    onActiveBannerChange(null)
    onFiltersChange({
      ...filters,
      media,
      format: 'Vertical',
      platform: media === 'video' ? 'Video Reels' : 'SMM Static',
    })
  }

  function toggleSelection(candidate) {
    const isSelected = selectedBannerIds.includes(candidate.id)
    onSelectedBannerIdsChange(isSelected
      ? selectedBannerIds.filter((id) => id !== candidate.id)
      : [...selectedBannerIds, candidate.id])
  }

  function getTemplate(candidate) {
    return templateById.get(candidate.templateId)
  }

  function getVisual(candidate) {
    return candidate.mediaType === 'video'
      ? videoById.get(candidate.sourceAssetId)
      : staticById.get(candidate.sourceAssetId)
  }

  const activeMotion = activeCandidate ? { ...defaultMotion, ...motionByBannerId[activeCandidate.id] } : defaultMotion
  const activeTemplate = activeCandidate ? getTemplate(activeCandidate) : null
  const activeVisual = activeCandidate ? getVisual(activeCandidate) : null

  return (
    <section className="banner-workspace" aria-label="Banner preview workspace">
      <div className="banner-toolbar">
        <div className="banner-filter">
          <FormatSelect value={filters.format} onChange={(value) => setFilter('format', value)} />
        </div>
        <label className="banner-filter banner-filter--platform">
          <select aria-label="Platform" value={filters.platform} onChange={(event) => setFilter('platform', event.target.value)}>{platformOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        {hasLinkedVideo && (
          <div className="banner-media-toggle" role="group" aria-label="Banner media">
            <button type="button" aria-pressed={filters.media === 'static'} onClick={() => setMedia('static')}>Static</button>
            <button type="button" aria-pressed={filters.media === 'video'} onClick={() => setMedia('video')}>Video</button>
          </div>
        )}
        <p className="banner-selection-count" aria-live="polite">{selectedBannerIds.length} selected for Figma assembly</p>
      </div>

      <div className="banner-workspace__content">
        <p className="banner-gallery-count">{visibleCandidates.length} banner compositions</p>
        {visibleCandidates.length === 0 ? (
          <div className="banner-filter-empty" role="status">No banner compositions match these filters.</div>
        ) : (
          <div className="banner-gallery" aria-label="Banner composition gallery">
            {visibleCandidates.map((candidate) => {
              const isSelected = selectedBannerIds.includes(candidate.id)
              return (
                <article className="banner-candidate" data-testid="banner-candidate" data-banner-id={candidate.id} data-selected={isSelected} key={candidate.id}>
                  <button type="button" className="banner-candidate__preview" aria-label={isSelected ? 'Selected for Figma assembly' : 'Select for Figma assembly'} aria-pressed={isSelected} onClick={() => toggleSelection(candidate)}>
                    <BannerPreview template={getTemplate(candidate)} visual={getVisual(candidate)} content={content} ratio={candidate.format === 'Horizontal' ? '1200 / 628' : candidate.format === 'Square' ? '1 / 1' : candidate.dimensions === '1080×1920' ? '9 / 16' : '4 / 5'} compact />
                    {isSelected && <span className="banner-candidate__check" aria-hidden="true"><Check size={16} /></span>}
                    <span className="banner-candidate__meta"><strong>{candidate.templateName}</strong><span>{candidate.dimensions} · {candidate.platform}</span></span>
                  </button>
                  <button type="button" className="banner-candidate__open" aria-label={`Open ${candidate.templateName}, ${candidate.dimensions} preview`} onClick={() => onActiveBannerChange(candidate.id)}><Eye size={16} aria-hidden="true" /></button>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {activeCandidate && activeTemplate && (
        <BannerDetailDialog
          candidate={activeCandidate}
          template={activeTemplate}
          visual={activeVisual}
          content={content}
          motion={activeMotion}
          onClose={() => onActiveBannerChange(null)}
          onMotionChange={onMotionChange}
          onReplayMotion={onReplayMotion}
        />
      )}
    </section>
  )
}

function BannerDetailDialog({ candidate, template, visual, content, motion, onClose, onMotionChange, onReplayMotion }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()

    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  function handleCancel(event) {
    event.preventDefault()
    onClose()
  }

  const ratio = candidate.format === 'Horizontal' ? '1200 / 628'
    : candidate.format === 'Square' ? '1 / 1'
      : candidate.dimensions === '1080×1920' ? '9 / 16' : '4 / 5'

  return (
    <dialog ref={dialogRef} className="banner-detail-dialog" aria-label="Banner detail preview" onCancel={handleCancel}>
      <header className="banner-detail-dialog__header">
        <div>
          <span>Banner detail</span>
          <h2>Preview &amp; motion</h2>
        </div>
        <button type="button" className="banner-detail-dialog__close" aria-label="Close banner preview" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="banner-detail">
        <div className="banner-detail__preview">
          <BannerPreview template={template} visual={visual} content={content} ratio={ratio} motionPreset={motion} motionVersion={motion.replayVersion} />
        </div>
        <div className="banner-detail__controls">
          <dl className="banner-detail__metadata">
            <DetailItem label="Template" value={candidate.templateName} />
            <DetailItem label="Dimensions" value={candidate.dimensions} />
            <DetailItem label="Format" value={candidate.format} />
            <DetailItem label="Platform" value={candidate.platform} />
            <DetailItem label="Media type" value={candidate.mediaType === 'video' ? 'Video' : 'Static'} />
            <DetailItem label="Source visual" value={visual?.name ?? 'Generated source visual'} />
          </dl>
          <div className="banner-motion-controls">
            <MotionSelect label="Text motion" channel="text" value={motion.text} onChange={(value) => onMotionChange(candidate.id, 'text', value)} />
            <MotionSelect label="Image motion" channel="image" value={motion.image} onChange={(value) => onMotionChange(candidate.id, 'image', value)} />
            <MotionSelect label="CTA motion" channel="cta" value={motion.cta} onChange={(value) => onMotionChange(candidate.id, 'cta', value)} />
            <button type="button" className="button button--secondary banner-motion-replay" onClick={() => onReplayMotion(candidate.id)}>Replay motion</button>
          </div>
        </div>
      </div>
    </dialog>
  )
}

function DetailItem({ label, value }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function MotionSelect({ label, channel, value, onChange }) {
  return <label className="banner-motion-select"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{motionOptions[channel].map(([preset, presetLabel]) => <option key={preset} value={preset}>{presetLabel}</option>)}</select></label>
}

function FormatSelect({ value, onChange }) {
  const selectedIndex = Math.max(0, formatOptions.findIndex(([optionValue]) => optionValue === value))
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    setActiveIndex(selectedIndex)
  }, [selectedIndex])

  useEffect(() => {
    if (open) listRef.current?.focus()
  }, [open])

  useEffect(() => {
    function closeFromOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    return () => document.removeEventListener('pointerdown', closeFromOutside)
  }, [])

  function openMenu(direction = 0) {
    setActiveIndex((selectedIndex + direction + formatOptions.length) % formatOptions.length)
    setOpen(true)
  }

  function closeMenu({ restoreFocus = false } = {}) {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  function selectFormat(optionValue) {
    onChange(optionValue)
    closeMenu({ restoreFocus: true })
  }

  function handleTriggerKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(event.key === 'ArrowDown' ? 0 : -1)
    }
  }

  function handleListKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu({ restoreFocus: true })
      return
    }
    if (event.key === 'Tab') {
      closeMenu()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectFormat(formatOptions[activeIndex][0])
      return
    }
    const nextIndex = event.key === 'ArrowDown' ? (activeIndex + 1) % formatOptions.length
      : event.key === 'ArrowUp' ? (activeIndex - 1 + formatOptions.length) % formatOptions.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? formatOptions.length - 1 : null
    if (nextIndex === null) return
    event.preventDefault()
    setActiveIndex(nextIndex)
  }

  const selectedLabel = formatOptions[selectedIndex][1]

  return (
    <div className="format-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="format-select__trigger"
        aria-label={`Format: ${selectedLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={handleTriggerKeyDown}
      >
        <FormatIcon format={value} />
        <span>{selectedLabel}</span>
        <ChevronDown className="format-select__chevron" size={15} aria-hidden="true" />
      </button>
      {open && (
        <ul
          ref={listRef}
          className="format-select__menu"
          role="listbox"
          aria-label="Format options"
          aria-activedescendant={`format-option-${formatOptions[activeIndex][0].toLowerCase()}`}
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
        >
          {formatOptions.map(([optionValue, label], index) => (
            <li
              id={`format-option-${optionValue.toLowerCase()}`}
              key={optionValue}
              role="option"
              aria-selected={value === optionValue}
              data-active={activeIndex === index}
              onClick={() => selectFormat(optionValue)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <FormatIcon format={optionValue} />
              <span>{label}</span>
              {value === optionValue && <Check size={15} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FormatIcon({ format }) {
  if (format === 'Horizontal') return <RectangleHorizontal size={16} aria-hidden="true" />
  if (format === 'Vertical') return <RectangleVertical size={16} aria-hidden="true" />
  if (format === 'Square') return <Square size={16} aria-hidden="true" />
  return <LayoutPanelTop size={16} aria-hidden="true" />
}
