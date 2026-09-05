import { useEffect, useState } from 'react'
import { Download, Pause, Play, RotateCcw } from 'lucide-react'
import { AnimatedBanner } from './AnimatedBanner.jsx'
import { Button, SectionHeading, useAssetUrl, saveBlob } from './primitives.jsx'
import { createAnimatedBannerHtml } from './exportAnimation.js'
import { selectedCopy } from './workflow.js'

export function BannerStage({
  workspace,
  templates,
  api,
  pending,
  readOnly,
  onSave,
  onNext,
  requestedTemplate,
  onDirty = () => {},
}) {
  const current = workspace.composition
  const copy = selectedCopy(workspace)
  const direction = workspace.directions.find(
    (item) => item.id === workspace.campaign.selectedDirectionId,
  )
  const { url: imageUrl } = useAssetUrl(api, direction?.previewAssetId)
  const [templateId, setTemplateId] = useState(
    requestedTemplate ?? current?.templateId ?? templates[0]?.id ?? '',
  )
  const [ratioIds, setRatioIds] = useState(current?.ratioIds ?? ['square'])
  const [previewRatio, setPreviewRatio] = useState('square')
  const [playing, setPlaying] = useState(true)
  const [replay, setReplay] = useState(0)
  const [values, setValues] = useState(
    current?.slotValues ?? {
      headline: copy?.headline ?? '',
      body: copy?.body ?? '',
      cta: copy?.cta ?? '',
      tag: copy?.offer ?? '',
    },
  )
  const [dirty, setDirty] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const template =
    templates.find((item) => item.id === templateId) ?? templates[0]
  useEffect(() => {
    onDirty(dirty)
  }, [dirty])
  function change(field, value) {
    setValues((previous) => ({ ...previous, [field]: value }))
    setDirty(true)
  }
  function toggleRatio(id) {
    setRatioIds((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    )
    setDirty(true)
  }
  async function save(event) {
    event.preventDefault()
    try {
      await onSave({
        templateId: template.id,
        templateVersion: template.version,
        ratioIds,
        slotValues: {
          headline: values.headline,
          body: values.body,
          cta: values.cta,
          ...(template.manifest.slots.some((slot) => slot.id === 'tag')
            ? { tag: values.tag ?? '' }
            : {}),
          image: direction.previewAssetId,
        },
      })
      setDirty(false)
      onDirty(false)
    } catch {
      /* Parent reports the server error; keep unsaved inputs. */
    }
  }
  async function exportAnimation() {
    setExporting(true)
    setExportError('')
    try {
      saveBlob(
        await createAnimatedBannerHtml({
          templateId: template.id,
          headline: values.headline,
          body: values.body,
          cta: values.cta,
          tag: values.tag ?? '',
          imageUrl,
          ratioId: previewRatio,
        }),
        `${template.id}-${previewRatio}-animation-draft.html`,
      )
    } catch (error) {
      setExportError(error.message)
    } finally {
      setExporting(false)
    }
  }
  return (
    <section>
      <SectionHeading title="Banners">
        Choose a layout, adjust the text and pick your formats. The saved
        composition is checked before review.
      </SectionHeading>
      <div className="bs-compose-grid">
        <div className="bs-preview-panel">
          <div className="bs-preview-toolbar">
            <label className="bs-inline-field">
              Preview
              <select
                value={previewRatio}
                onChange={(event) => setPreviewRatio(event.target.value)}
              >
                {template?.manifest.ratios.map((ratio) => (
                  <option value={ratio.id} key={ratio.id}>
                    {ratio.width} × {ratio.height}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <Button
                aria-label={playing ? 'Pause animation' : 'Play animation'}
                onClick={() => setPlaying(!playing)}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </Button>
              <Button
                aria-label="Replay animation"
                onClick={() => {
                  setReplay(replay + 1)
                  setPlaying(true)
                }}
              >
                <RotateCcw size={16} />
              </Button>
            </div>
          </div>
          <div className="bs-banner-canvas">
            <AnimatedBanner
              key={`${templateId}-${previewRatio}-${replay}`}
              templateId={template?.id}
              headline={values.headline}
              body={values.body}
              cta={values.cta}
              tag={values.tag ?? ''}
              imageUrl={imageUrl}
              ratioId={previewRatio}
              playing={playing}
            />
          </div>
          <p className="bs-preview-caption">
            Animated layout preview · Approved delivery contains PNG files
          </p>
        </div>
        <form className="bs-composition-form" onSubmit={save}>
          <fieldset disabled={readOnly || Boolean(pending)}>
            <label className="bs-field">
              <span>Template</span>
              <select
                value={templateId}
                onChange={(event) => {
                  setTemplateId(event.target.value)
                  setDirty(true)
                }}
              >
                {templates.map((item) => (
                  <option key={`${item.id}-${item.version}`} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {[
              'headline',
              'body',
              'cta',
              ...(template?.manifest.slots.some((slot) => slot.id === 'tag')
                ? ['tag']
                : []),
            ].map((field) => (
              <label className="bs-field" key={field}>
                <span>
                  {
                    {
                      headline: 'Headline',
                      body: 'Short text',
                      cta: 'Call to action',
                      tag: 'Tag (optional)',
                    }[field]
                  }
                </span>
                <textarea
                  rows={field === 'cta' || field === 'tag' ? 1 : 3}
                  required={field !== 'tag'}
                  maxLength={
                    template?.manifest.slots.find((slot) => slot.id === field)
                      ?.maxCharacters ?? 160
                  }
                  value={values[field] ?? ''}
                  onChange={(event) => change(field, event.target.value)}
                />
              </label>
            ))}
            <div className="bs-field">
              <span>Export formats</span>
              <div className="bs-format-options">
                {template?.manifest.ratios.map((ratio) => (
                  <label key={ratio.id}>
                    <input
                      type="checkbox"
                      checked={ratioIds.includes(ratio.id)}
                      onChange={() => toggleRatio(ratio.id)}
                    />
                    <span>
                      {ratio.id}
                      <small>
                        {ratio.width} × {ratio.height}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
          {current?.validation?.errors.length > 0 && (
            <div className="bs-validation" role="alert">
              <strong>Adjust the composition</strong>
              <ul>
                {current.validation.errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}
          {!readOnly && (
            <Button
              type="submit"
              primary
              disabled={
                !template ||
                !ratioIds.length ||
                !direction?.previewAssetId ||
                Boolean(pending)
              }
              busy={pending === 'Save composition'}
            >
              Save and check layout
            </Button>
          )}
        </form>
      </div>
      <div className="bs-animation-export">
        <Button
          onClick={exportAnimation}
          disabled={!imageUrl || exporting}
          busy={exporting}
        >
          <Download size={15} aria-hidden="true" />
          Download animation draft
        </Button>
        <p className="bs-note">
          Self-contained HTML preview. This draft has not been approved for
          delivery.
        </p>
        {exportError && <p role="alert">{exportError}</p>}
      </div>
      {current?.validation.valid && !current.stale && !dirty && (
        <footer className="bs-actionbar">
          <span className="bs-note">
            Layout checks passed for {current.ratioIds.length} format
            {current.ratioIds.length !== 1 ? 's' : ''}.
          </span>
          <Button primary onClick={onNext}>
            Continue to review file
          </Button>
        </footer>
      )}
    </section>
  )
}
