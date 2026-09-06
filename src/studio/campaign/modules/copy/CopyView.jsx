import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Check, Eye, FileText, Sparkles, Trash2 } from 'lucide-react'
import { AppButton } from '../../../../components/design-system/atoms/AppButton.jsx'
import { ActionCard } from '../../../../components/design-system/molecules/ActionCard.jsx'
import { EmptyState } from '../../../../components/design-system/molecules/EmptyState.jsx'
import { useExitPresence } from '../../../../components/design-system/molecules/useExitPresence.js'
import { PreviewDialog } from '../../../../components/design-system/organisms/PreviewDialog.jsx'
import { ErrorNotice, SectionHeading, useAssetUrl } from '../../../primitives.jsx'
import './copy-cards.css'

const AnimatedBanner = lazy(() => import('../../../AnimatedBanner.jsx').then(module => ({ default: module.AnimatedBanner })))

function CopyPreview({ copy, input, assets, onClose }) {
  const { url: imageUrl, error: imageError } = useAssetUrl(assets, input.previewAssetId)
  return <PreviewDialog title={`Option ${copy.number} preview`} onClose={onClose}>
    <Suspense fallback={<p role="status">Loading banner preview…</p>}>
      <AnimatedBanner templateId={input.previewTemplateId ?? 'editorial-split'} headline={copy.headline}
        body={copy.body} cta={copy.cta} tag={copy.offer} imageUrl={imageUrl || undefined} playing={false} />
    </Suspense>
    <p className="bs-note">{imageError ? 'Campaign image unavailable; showing an example image.' : imageUrl
      ? 'Using your selected campaign image.' : 'Layout preview with an example image. No image is generated.'}</p>
  </PreviewDialog>
}

/** Domain-only view: no workspace, HTTP client, revision, or sibling state. */
export function CopyView({ input, access, operation, actions, assets, onNext,
  nextLabel = 'Continue to Visuals', heading = true }) {
  const [actionError, setActionError] = useState(null)
  const [localAction, setLocalAction] = useState(null)
  const [previewId, setPreviewId] = useState(null)
  const inFlight = useRef(false)
  const pending = operation.kind === 'running' || !!localAction
  const uncertain = operation.kind === 'uncertain'
  const readOnly = !access.canEdit
  const sets = useMemo(() => input.copies.filter(set => !set.stale), [input.copies])
  const currentSet = sets.find(set => set.id === input.selectedCopyId)
  const options = useMemo(() => sets.flatMap(set => set.candidates.map(copy => ({ ...copy,
    approved: set.approvedCandidateIds?.includes(copy.id)
      || (!set.approvedCandidateIds && set.id === currentSet?.id && set.selectedCandidateId === copy.id),
  }))).map((copy, index) => ({ ...copy, number: index + 1 })), [sets, currentSet])
  const displayed = useExitPresence(options)
  const preview = options.find(copy => copy.id === previewId)
  const atLimit = options.length >= 30
  const hasAnalysis = !!input.analysis || sets.length > 0

  async function attempt(kind, action, id) {
    if (inFlight.current || !action) return
    inFlight.current = true
    setActionError(null)
    setLocalAction({ kind, id })
    try {
      const result = await action(...(id ? [id] : []))
      if (result?.ok === false) setActionError(result)
    } catch (error) { setActionError(error) }
    finally { inFlight.current = false; setLocalAction(null) }
  }

  return <section aria-label="Copy module" aria-busy={pending || undefined}>
    {heading && <SectionHeading title="Copy" />}
    <ErrorNotice error={operation.error ?? actionError} />
    {displayed.length === 0 ? <EmptyState icon={<FileText size={28} />}>
      {pending ? 'Generating your first five copy options…' : access.stale
        ? 'The brief has changed. Previous copy is kept in history. Generate updated options after analyzing the new brief.' : hasAnalysis
        ? 'No copy options yet. Generate a new batch below.' : 'Add a brief to generate banner copy.'}
    </EmptyState> : <div className="bs-copy-card-list">
      {displayed.map(({ item: copy, exiting }) => <ActionCard key={copy.id} label={`Option ${copy.number}`} exiting={exiting}
        highlighted={copy.approved} dismissing={localAction?.kind === 'remove' && localAction.id === copy.id}
        status={copy.approved && <span className="bs-copy-card-status"><Check size={14} aria-hidden="true" />Approved</span>}
        actions={<div role="group" aria-label={`Actions for option ${copy.number}`}>
          <AppButton iconOnly size="compact" aria-label={copy.approved && !currentSet ? `Use option ${copy.number} for banners` : `Approve option ${copy.number}`}
            title={copy.approved ? currentSet ? 'Approved' : 'Use approved copy for banners' : 'Approve copy'}
            aria-pressed={!!copy.approved} variant={copy.approved ? 'primary' : 'secondary'}
            disabled={readOnly || pending || uncertain || (copy.approved && !!currentSet) || !actions.approve}
            onClick={() => attempt('approve', actions.approve, copy.id)}><Check size={18} aria-hidden="true" /></AppButton>
          <AppButton iconOnly size="compact" aria-label={`Delete option ${copy.number}`} title="Delete copy"
            disabled={readOnly || pending || uncertain || !actions.remove}
            onClick={() => attempt('remove', actions.remove, copy.id)}><Trash2 size={18} aria-hidden="true" /></AppButton>
        </div>}
        persistentAction={<AppButton iconOnly size="compact" aria-label={`Preview option ${copy.number}`} title="Preview copy on a banner"
          onClick={() => setPreviewId(copy.id)}><Eye size={18} aria-hidden="true" /></AppButton>}>
        <h3>{copy.headline}</h3><p>{copy.body}</p>
        <div className="bs-copy-card-details"><div><span>CTA</span><strong>{copy.cta}</strong></div>
          {copy.offer && <div><span>Tag</span><strong>{copy.offer}</strong></div>}</div>
      </ActionCard>)}
    </div>}
    {(options.length > 0 || hasAnalysis) && <footer className="bs-copy-card-footer">
      <AppButton onClick={() => attempt('generate', actions.generate)}
        disabled={readOnly || pending || atLimit || !actions.generate || uncertain}
        busy={(pending && (localAction?.kind === 'generate' || operation.actionId === 'generate'))}>
        <Sparkles size={16} aria-hidden="true" />Generate More Options
      </AppButton>
      <span className="bs-copy-card-count" role="status">{options.length} / 30 options{atLimit ? ' · Delete an option to make room.' : ''}</span>
    </footer>}
    {!currentSet && options.some(copy => copy.approved) && <p className="bs-note">Choose an approved card’s check icon to use it for banners.</p>}
    {uncertain && operation.actionId === 'generate' && <AppButton onClick={() => attempt('generate', actions.generate)} disabled={pending}>
      Check generation result
    </AppButton>}
    {currentSet && onNext && <footer className="bs-actionbar">
      <AppButton variant="primary" onClick={onNext}>{nextLabel}</AppButton>
    </footer>}
    {preview && <CopyPreview copy={preview} input={input} assets={assets} onClose={() => setPreviewId(null)} />}
  </section>
}
