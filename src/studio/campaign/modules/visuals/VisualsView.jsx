import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ImagePlus, LoaderCircle, Sparkles, Upload, Video } from 'lucide-react'
import { AppButton } from '../../../../components/design-system/atoms/AppButton.jsx'
import { TextAction } from '../../../../components/design-system/atoms/TextAction.jsx'
import { ActionCard } from '../../../../components/design-system/molecules/ActionCard.jsx'
import { EmptyState } from '../../../../components/design-system/molecules/EmptyState.jsx'
import { SelectMenu } from '../../../../components/design-system/molecules/SelectMenu.jsx'
import { MediaWorkflowCard } from '../../../../components/design-system/organisms/MediaWorkflowCard.jsx'
import { AssetImage } from '../../../primitives.jsx'
import { missingStatic, selectedCopies, visualStatus } from './visualsModel.js'
import './visuals.css'

function CopyPrompt({ prompt }) {
  const [feedback, setFeedback] = useState('')
  const timer = useRef()
  useEffect(() => () => clearTimeout(timer.current), [])
  return <><TextAction disabled={!prompt} onClick={async () => {
    clearTimeout(timer.current)
    try { await navigator.clipboard.writeText(prompt); setFeedback('Copied') }
    catch { setFeedback('Could not copy. Select the prompt text and copy it manually.') }
    timer.current = setTimeout(() => setFeedback(''), 2500)
  }}><Copy size={16} aria-hidden="true" />Copy prompt</TextAction><span role="status" className="bs-visual-feedback">{feedback}</span></>
}

export function VisualsView({ input, assets, pending, progress, feedback, readOnly, onGenerate, onGenerateAll, onImage, onUpload, onSelect, onNext, onClearFeedback = () => {}, heading = false }) {
  const fileInput = useRef(null)
  const uploadTarget = useRef(null)
  const [chooseUploadCopy, setChooseUploadCopy] = useState(false)
  const copies = selectedCopies(input)
  const directions = input.directions
  const ready = Boolean(input.analysis || input.copies?.length)
  const busy = Boolean(pending || progress)
  const disabled = readOnly || busy
  const missing = missingStatic(input)
  const uploadFeedback = feedback?.kind === 'upload' ? feedback : null
  const copyLabel = id => {
    const index = (input.copies ?? []).findIndex(copy => copy.id === id)
    return index < 0 ? 'Earlier option' : `Option ${index + 1}`
  }
  const uploadOption = copy => `${copyLabel(copy.id)} — ${copy.headline}`
  function chooseFile(target) {
    uploadTarget.current = target
    onClearFeedback()
    fileInput.current?.click()
  }
  return <div className="bs-visuals-module">
    {heading && <h2>Visuals</h2>}
    {!ready && <EmptyState icon={<ImagePlus size={32} />}>Analyze your brief to prepare visual prompts.</EmptyState>}
    {ready && <>
      <div className="bs-visual-methods">
        <ActionCard label={`${copies.length} copy option${copies.length === 1 ? '' : 's'} selected`}>
          <h3>Visuals for selected copy</h3>
          <p>One tailored visual for each selected copy option.</p>
          <AppButton variant="primary" disabled={disabled || !copies.length} onClick={() => onGenerate('selected_copy')}><Sparkles size={16} aria-hidden="true" />Generate visuals for selected copy</AppButton>
          <p className="bs-visual-guidance">{copies.length ? 'Approved copy options are selected for this method.' : 'Approve options in Copy to select them for visuals.'}</p>
          <TextAction disabled={disabled || !copies.length} onClick={() => copies.length === 1 ? chooseFile({ mode: 'selected_copy', copyId: copies[0].id }) : setChooseUploadCopy(value => !value)}><Upload size={16} aria-hidden="true" />Upload visual</TextAction>
          {chooseUploadCopy && copies.length > 1 && <SelectMenu label="Copy for uploaded visual" value="Choose copy" disabled={disabled}
            options={copies.map(uploadOption)} onChange={label => {
              const index = copies.findIndex(copy => uploadOption(copy) === label)
              if (index >= 0) { chooseFile({ mode: 'selected_copy', copyId: copies[index].id }); setChooseUploadCopy(false) }
            }} />}
          {uploadFeedback?.target.mode === 'selected_copy' && <p role="alert">{uploadFeedback.error.message}</p>}
        </ActionCard>
        <ActionCard label="3 reusable visuals">
          <h3>Campaign-wide visuals</h3>
          <p>Three visual options based on your brief and all copy. Use them with any copy option.</p>
          <AppButton variant="primary" disabled={disabled} onClick={() => onGenerate('campaign')}><Sparkles size={16} aria-hidden="true" />Generate campaign-wide visuals</AppButton>
          <TextAction disabled={disabled} onClick={() => chooseFile({ mode: 'campaign' })}><Upload size={16} aria-hidden="true" />Upload visual</TextAction>
          {uploadFeedback?.target.mode === 'campaign' && <p role="alert">{uploadFeedback.error.message}</p>}
        </ActionCard>
      </div>
      <p className="bs-visual-guidance">Generation starts immediately. Upload your own image to skip AI generation.</p>
    </>}
    {progress && <p role="status" className="bs-visual-progress"><LoaderCircle size={16} className="v2-button-spinner" aria-hidden="true" />{progress.stage === 'prompts'
      ? `Creating prompts for ${progress.total} visuals…`
      : `Generating visual ${progress.current} of ${progress.total}…`}</p>}
    {!!missing.length && <div className="bs-module-toolbar"><span>{missing.length} missing visual{missing.length === 1 ? '' : 's'}</span><AppButton disabled={disabled} onClick={onGenerateAll}><Sparkles size={16} aria-hidden="true" />Generate All Static Visuals</AppButton></div>}
    <input ref={fileInput} className="bs-visual-file-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload image file" onChange={async event => {
      const file = event.target.files?.[0]
      const target = uploadTarget.current
      event.target.value = ''
      if (!file || !target) return
      await onUpload(target, file)
    }} />
    <div className="bs-visual-results">{directions.map(direction => {
      const selected = !direction.stale && input.selectedDirectionId === direction.id
      const state = visualStatus(direction)
      const generating = pending === `image:${direction.id}` || direction.generation?.status === 'pending'
      const imageError = feedback?.kind === 'image' && feedback.target.directionId === direction.id ? feedback.error : null
      const directionUploadError = uploadFeedback?.target.directionId === direction.id ? uploadFeedback.error : null
      const unresolved = direction.generation?.status === 'unknown'
      const blocked = state === 'blocked'
      const linked = direction.scope === 'selected_copy' && direction.copy
      return <MediaWorkflowCard key={direction.id} title={direction.title} selected={selected}
        context={linked ? <><span>Linked copy · {copyLabel(direction.copy.id)}</span><p>{direction.copy.headline}</p></> : direction.scope === 'campaign' ? 'Campaign-wide · Works with any copy' : 'Visual direction'}
        status={direction.stale ? <span className="bs-status">Source changed</span> : direction.source === 'upload' ? <span className="bs-status">Uploaded</span> : selected ? <span className="bs-status">Selected</span> : null}
        columns={[
          { id: 'prompt', label: 'Prompt', content: <><p>{direction.prompt || 'No generated prompt available.'}</p>{direction.stale && <p className="bs-visual-guidance">Saved from earlier input. Create a new visual to use the current brief and copy.</p>}</>, actions: direction.prompt ? <CopyPrompt prompt={direction.prompt} /> : null },
          { id: 'static', label: 'Static visual', content: direction.previewAssetId
            ? <div className="bs-visual-image" role="group" aria-label={`${direction.title} image`}><AssetImage api={assets} assetId={direction.previewAssetId} alt={direction.title} /></div>
            : <div className="bs-visual-placeholder" role="group" aria-label={`${direction.title} image`}><ImagePlus size={32} aria-hidden="true" />
              {imageError ? <p role="alert">{imageError.message}</p>
                : state === 'failed' && <p role="alert">Image generation failed. Retry this image or upload your own.</p>}
              {unresolved && <p role="status">Status needs checking. Check latest state before retrying.</p>}
              {blocked && <p>Generation was blocked. Upload a suitable image instead.</p>}
              {!blocked && !unresolved && !direction.stale && <AppButton variant="primary" busy={generating} disabled={disabled} onClick={() => onImage(direction.id)}><Sparkles size={16} aria-hidden="true" />{generating ? 'Generating image…' : state === 'failed' ? 'Retry image' : 'Generate image'}</AppButton>}
            </div>, actions: <>
              {direction.previewAssetId && <AppButton variant={selected ? 'secondary' : 'primary'} disabled={disabled || direction.stale || selected || (!input.selectedCopy && !linked)} onClick={() => onSelect(direction.id)}>{selected && <Check size={16} aria-hidden="true" />}{selected ? 'Selected' : 'Use this image'}</AppButton>}
              {direction.previewAssetId && !input.selectedCopy && !linked && <p className="bs-visual-guidance">Select copy in Copy to use this image in Banners.</p>}
              {!direction.stale && <TextAction disabled={disabled || unresolved || generating} onClick={() => chooseFile({ directionId: direction.id })}><Upload size={16} aria-hidden="true" />Upload visual</TextAction>}
              {directionUploadError && <p role="alert">{directionUploadError.message}</p>}
            </> },
          { id: 'video', label: 'Video', content: <div className="bs-visual-placeholder"><Video size={32} aria-hidden="true" /><p>No video yet</p></div> },
        ]} />
    })}</div>
    {directions.some(direction => direction.id === input.selectedDirectionId && !direction.stale && direction.previewAssetId) && <div className="bs-stage-footer"><p>Image selected.</p><AppButton variant="primary" onClick={onNext}>Continue to banners</AppButton></div>}
  </div>
}
