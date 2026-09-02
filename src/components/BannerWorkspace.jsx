import { LayoutPanelTop, RectangleHorizontal, RectangleVertical, Square } from 'lucide-react'
import { useEffect, useMemo } from 'react'
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
  const activeCandidate = visibleCandidates.find((candidate) => candidate.id === activeBannerId) ?? visibleCandidates[0] ?? null
  const templateById = useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates])
  const staticById = useMemo(() => new Map(staticAssets.map((asset) => [asset.id, asset])), [staticAssets])
  const videoById = useMemo(() => new Map(videoAssets.map((asset) => [asset.id, asset])), [videoAssets])

  useEffect(() => {
    if (!hasLinkedVideo && filters.media === 'video') {
      onFiltersChange({ media: 'static', format: 'Vertical', platform: 'SMM Static' })
    }
  }, [filters.media, hasLinkedVideo, onFiltersChange])

  function setFilter(name, value) {
    onFiltersChange({ ...filters, [name]: value })
  }

  function setMedia(media) {
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
    onActiveBannerChange(candidate.id)
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
        <label className="banner-filter">
          <span>Format</span>
          <span className="banner-filter__control"><FormatIcon format={filters.format} /><select aria-label="Format" value={filters.format} onChange={(event) => setFilter('format', event.target.value)}>{formatOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></span>
        </label>
        <label className="banner-filter">
          <span>Platform</span>
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
        <div>
          <p className="banner-gallery-count">{visibleCandidates.length} banner compositions</p>
          {visibleCandidates.length === 0 ? (
            <div className="banner-filter-empty" role="status">No banner compositions match these filters.</div>
          ) : (
            <div className="banner-gallery" aria-label="Banner composition gallery">
              {visibleCandidates.map((candidate) => {
                const isSelected = selectedBannerIds.includes(candidate.id)
                return (
                  <article className="banner-candidate" data-testid="banner-candidate" data-banner-id={candidate.id} data-selected={isSelected} key={candidate.id}>
                    <button type="button" className="banner-candidate__preview" aria-label={`Open ${candidate.templateName}, ${candidate.dimensions} preview`} onClick={() => onActiveBannerChange(candidate.id)}>
                      <BannerPreview template={getTemplate(candidate)} visual={getVisual(candidate)} content={content} ratio={candidate.format === 'Horizontal' ? '1200 / 628' : candidate.format === 'Square' ? '1 / 1' : candidate.dimensions === '1080×1920' ? '9 / 16' : '4 / 5'} compact />
                    </button>
                    <div className="banner-candidate__meta"><strong>{candidate.templateName}</strong><span>{candidate.dimensions} · {candidate.platform}</span></div>
                    <button type="button" className="banner-candidate__select" aria-pressed={isSelected} onClick={() => toggleSelection(candidate)}>Select for Figma assembly</button>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        {activeCandidate && activeTemplate && (
          <aside className="banner-detail" role="region" aria-label="Banner detail preview">
            <BannerPreview template={activeTemplate} visual={activeVisual} content={content} ratio={activeCandidate.format === 'Horizontal' ? '1200 / 628' : activeCandidate.format === 'Square' ? '1 / 1' : activeCandidate.dimensions === '1080×1920' ? '9 / 16' : '4 / 5'} motionPreset={activeMotion} motionVersion={activeMotion.replayVersion} />
            <dl className="banner-detail__metadata">
              <DetailItem label="Template" value={activeCandidate.templateName} />
              <DetailItem label="Dimensions" value={activeCandidate.dimensions} />
              <DetailItem label="Format" value={activeCandidate.format} />
              <DetailItem label="Platform" value={activeCandidate.platform} />
              <DetailItem label="Media type" value={activeCandidate.mediaType === 'video' ? 'Video' : 'Static'} />
              <DetailItem label="Source visual" value={activeVisual?.name ?? 'Generated source visual'} />
            </dl>
            <div className="banner-motion-controls">
              <MotionSelect label="Text motion" channel="text" value={activeMotion.text} onChange={(value) => onMotionChange(activeCandidate.id, 'text', value)} />
              <MotionSelect label="Image motion" channel="image" value={activeMotion.image} onChange={(value) => onMotionChange(activeCandidate.id, 'image', value)} />
              <MotionSelect label="CTA motion" channel="cta" value={activeMotion.cta} onChange={(value) => onMotionChange(activeCandidate.id, 'cta', value)} />
              <button type="button" className="button button--secondary banner-motion-replay" onClick={() => onReplayMotion(activeCandidate.id)}>Replay motion</button>
            </div>
          </aside>
        )}
      </div>
    </section>
  )
}

function DetailItem({ label, value }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function MotionSelect({ label, channel, value, onChange }) {
  return <label className="banner-motion-select"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{motionOptions[channel].map(([preset, presetLabel]) => <option key={preset} value={preset}>{presetLabel}</option>)}</select></label>
}

function FormatIcon({ format }) {
  if (format === 'Horizontal') return <RectangleHorizontal size={16} aria-hidden="true" />
  if (format === 'Vertical') return <RectangleVertical size={16} aria-hidden="true" />
  if (format === 'Square') return <Square size={16} aria-hidden="true" />
  return <LayoutPanelTop size={16} aria-hidden="true" />
}
