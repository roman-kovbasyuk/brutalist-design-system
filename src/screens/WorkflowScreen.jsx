import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, ClipboardCheck, Download, ExternalLink, Sparkles } from 'lucide-react'
import { BannerPreview } from '../components/BannerPreview.jsx'
import { ProcessingScreen } from '../components/ProcessingScreen.jsx'
import { StepRail } from '../components/StepRail.jsx'
import { TemplateCard } from '../components/TemplateCard.jsx'
import { VisualArtwork } from '../components/VisualArtwork.jsx'
import {
  analyzeBrief,
  createCreativeFingerprint,
  generatePromptIdeas,
  generateVisuals,
  getContentWarnings,
  getResizeLayouts,
  isApprovalCurrent,
  isValidFigmaUrl,
} from '../domain/campaign.js'
import { templates } from '../data/templates.js'

const initialBrief = 'Launch a Norwegian language intensive for people planning to move to Oslo. Offer 15% off until Sunday. Show that learners can handle everyday conversations while still taking the course.'

const analysisStates = [
  'Analyzing the brief with AI',
  'Identifying audience and offer',
  'Creating copy for banners',
  'Developing visual directions',
  'Preparing image and video prompts',
]
const analysisPhaseDuration = 250

export function WorkflowScreen({ requestedTemplate }) {
  const [step, setStep] = useState(1)
  const [maxStep, setMaxStep] = useState(1)
  const [brief, setBrief] = useState(initialBrief)
  const [error, setError] = useState('')
  const [strategy, setStrategy] = useState(null)
  const [promptIdeas, setPromptIdeas] = useState([])
  const [processing, setProcessing] = useState(null)
  const [visuals, setVisuals] = useState([])
  const [selectedVisualId, setSelectedVisualId] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(requestedTemplate?.id ?? null)
  const [reviewStatus, setReviewStatus] = useState('ready')
  const [figmaUrl, setFigmaUrl] = useState('https://figma.com/file/demo-lingu-studio')
  const [approvedFingerprint, setApprovedFingerprint] = useState(null)

  useEffect(() => {
    if (!requestedTemplate?.id) return
    setSelectedTemplateId(requestedTemplate.id)
    setReviewStatus('ready')
    setApprovedFingerprint(null)
    if (strategy && selectedVisualId) {
      setStep(5)
      setMaxStep(5)
    }
  }, [requestedTemplate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!processing) return undefined

    const timerId = window.setTimeout(() => {
      if (processing.activeIndex < analysisStates.length - 1) {
        setProcessing((current) => current && { ...current, activeIndex: current.activeIndex + 1 })
        return
      }

      const nextStrategy = processing.strategy
      setStrategy(nextStrategy)
      setPromptIdeas(generatePromptIdeas(nextStrategy))
      setVisuals(generateVisuals(nextStrategy))
      setSelectedVisualId(null)
      setReviewStatus('ready')
      setApprovedFingerprint(null)
      setProcessing(null)
      advance(2)
    }, analysisPhaseDuration)

    return () => window.clearTimeout(timerId)
  }, [processing]) // The timer is replaced and cleared for every deterministic phase.

  const selectedVisual = visuals.find((visual) => visual.id === selectedVisualId)
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId)
  const resizeLayouts = useMemo(() => getResizeLayouts(selectedTemplate), [selectedTemplate])
  const copyWarnings = useMemo(() => getContentWarnings(strategy), [strategy])
  const creativeFingerprint = createCreativeFingerprint({
    brief,
    strategy,
    selectedVisualId,
    selectedTemplateId,
  })
  const reviewIsCurrent = reviewStatus === 'approved' && isApprovalCurrent(approvedFingerprint, creativeFingerprint)
  const visibleReviewStatus = reviewIsCurrent ? 'approved' : reviewStatus === 'in-review' ? 'in-review' : 'ready'
  const figmaLinkIsValid = isValidFigmaUrl(figmaUrl.trim())

  function advance(nextStep) {
    setStep(nextStep)
    setMaxStep((current) => Math.max(current, nextStep))
  }

  function handleAnalyze() {
    try {
      const nextStrategy = analyzeBrief(brief)
      setError('')
      setProcessing({ strategy: nextStrategy, activeIndex: 0 })
    } catch (nextError) {
      setError(nextError.message)
    }
  }

  function updateStrategy(field, value) {
    setStrategy((current) => ({ ...current, [field]: value }))
    setSelectedVisualId(null)
    setReviewStatus('ready')
    setApprovedFingerprint(null)
    setMaxStep((current) => Math.min(current, 2))
  }

  function updateBrief(value) {
    setBrief(value)
    setStrategy(null)
    setPromptIdeas([])
    setProcessing(null)
    setVisuals([])
    setSelectedVisualId(null)
    setSelectedTemplateId(null)
    setReviewStatus('ready')
    setApprovedFingerprint(null)
    setMaxStep(1)
  }

  function selectVisual(visualId) {
    setSelectedVisualId(visualId)
    setReviewStatus('ready')
    setApprovedFingerprint(null)
    setMaxStep((current) => Math.min(current, 4))
  }

  function selectTemplate(templateId) {
    setSelectedTemplateId(templateId)
    setReviewStatus('ready')
    setApprovedFingerprint(null)
    setMaxStep((current) => Math.min(current, 5))
  }

  function approveReview() {
    setReviewStatus('approved')
    setApprovedFingerprint(creativeFingerprint)
  }

  function downloadManifest() {
    const payload = {
      version: 1,
      brief,
      strategy,
      selectedVisual,
      selectedTemplate,
      review: {
        status: visibleReviewStatus,
        figmaUrl,
        approvedFingerprint,
      },
      outputs: resizeLayouts,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'lingu-studio-campaign.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="workflow-layout">
      <StepRail currentStep={processing ? null : step} maxStep={maxStep} onStepChange={setStep} />
      <section className="workflow-stage" key={processing ? 'processing' : step}>
        {processing && <ProcessingScreen states={analysisStates} activeIndex={processing.activeIndex} progress={(processing.activeIndex + 1) * 20} />}
        {!processing && step === 1 && (
          <>
            <StageHeader count="01 / 07" title="Tell us your campaign idea" description="A free-form brief is the only required input. We’ll prepare the copy and prompts." />
            <div className="stage-grid stage-grid--brief">
              <div className="field-group field-group--large">
                <label htmlFor="campaign-brief">Campaign idea</label>
                <textarea id="campaign-brief" value={brief} onChange={(event) => updateBrief(event.target.value)} />
                <div className="field-meta"><span>{brief.length} characters</span><span>Write naturally</span></div>
                {error && <p className="inline-error" role="alert">{error}</p>}
              </div>
              <aside className="brief-aside">
                <p>The system will identify</p>
                <ul><li>audience and objective</li><li>offer and CTA</li><li>message structure</li><li>image and video prompts</li></ul>
                <span>Demo mode uses a local generator. Your data never leaves the browser.</span>
              </aside>
            </div>
            <StageActions><PrimaryButton onClick={handleAnalyze}>Analyze brief</PrimaryButton></StageActions>
          </>
        )}

        {!processing && step === 2 && strategy && (
          <>
            <StageHeader count="02 / 07" title="Copy" description="Review this interpretation of the brief. You can edit the copy before generating visuals." />
            <dl className="strategy-summary">
              <DescriptionRow label="Audience" value={strategy.audience} />
              <DescriptionRow label="Objective" value={strategy.goal} />
              <DescriptionRow label="Offer" value={strategy.offer} />
            </dl>
            <div className="copy-editor">
              <TextField label="Headline" value={strategy.headline} onChange={(value) => updateStrategy('headline', value)} />
              <TextField label="Body copy" value={strategy.body} onChange={(value) => updateStrategy('body', value)} multiline />
              <TextField label="CTA" value={strategy.cta} onChange={(value) => updateStrategy('cta', value)} />
            </div>
            <div className="prompt-grid">
              <PromptBlock label="Static image prompt" value={strategy.imagePrompt} />
              <PromptBlock label="Video prompt" value={strategy.videoPrompt} />
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(1)}>Back</SecondaryButton><PrimaryButton onClick={() => advance(3)}>Generate visuals</PrimaryButton></StageActions>
          </>
        )}

        {step === 3 && (
          <>
            <StageHeader count="03 / 07" title="Choose a visual direction" description="Five options use the same message but explore different imagery and motion." />
            <div className="visual-grid">
              {visuals.map((visual, index) => (
                <article className="visual-option" data-selected={selectedVisualId === visual.id} key={visual.id}>
                  <button type="button" aria-label={`Select visual ${visual.name}`} aria-pressed={selectedVisualId === visual.id} onClick={() => selectVisual(visual.id)}>
                    <VisualArtwork visual={visual} />
                    <span className="visual-option-meta"><span>{String(index + 1).padStart(2, '0')} · {visual.direction}</span><strong>{visual.name}</strong></span>
                  </button>
                  <details><summary>Show prompt</summary><p>{visual.prompt}</p></details>
                </article>
              ))}
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(2)}>Back</SecondaryButton><PrimaryButton disabled={!selectedVisualId} onClick={() => advance(4)}>Choose a template</PrimaryButton></StageActions>
          </>
        )}

        {step === 4 && (
          <>
            <StageHeader count="04 / 07" title="Choose a composition" description="The template sets hierarchy and balance while keeping your copy and selected visual." />
            <div className="template-picker">
              {templates.map((template) => <TemplateCard key={template.id} template={template} selected={selectedTemplateId === template.id} onChoose={selectTemplate} mode="picker" />)}
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(3)}>Back</SecondaryButton><PrimaryButton disabled={!selectedTemplateId} onClick={() => advance(5)}>Build draft</PrimaryButton></StageActions>
          </>
        )}

        {step === 5 && selectedTemplate && (
          <>
            <StageHeader count="05 / 07" title="Draft master" description="Copy, visual, and composition are assembled. This is a preview, not the final creative." />
            <div className="assembly-grid">
              <div className="master-preview"><BannerPreview template={selectedTemplate} visual={selectedVisual} content={strategy} /></div>
              <aside className="assembly-spec">
                <p className="spec-title">Assembly</p>
                <MetaBlock label="Template" value={`${String(selectedTemplate.index).padStart(2, '0')} · ${selectedTemplate.name}`} />
                <MetaBlock label="Visual" value={selectedVisual?.name} />
                <MetaBlock label="Master" value={selectedTemplate.masterRatio === 'story' ? '1080×1920' : '1080×1350'} />
                <MetaBlock label="Motion" value={selectedTemplate.motion} />
                {copyWarnings.length === 0 ? (
                  <div className="check-list"><p><Check size={15} /> Automated check: copy is within limits</p><p>A designer will verify contrast and safe zones</p></div>
                ) : (
                  <div className="content-warning" role="alert"><AlertTriangle size={17} /><div><strong>Copy needs attention</strong>{copyWarnings.map((warning) => <span key={warning}>{warning}</span>)}</div></div>
                )}
              </aside>
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(4)}>Change template</SecondaryButton><PrimaryButton onClick={() => advance(6)}>Prepare Figma packet</PrimaryButton></StageActions>
          </>
        )}

        {step === 6 && (
          <>
            <StageHeader count="06 / 07" title="Designer review" description="Final rendering stays locked until a designer reviews the master in Figma." />
            <section className="review-packet" aria-label="Review packet">
              <header><span>Review packet · local simulation</span><code>{selectedTemplate?.id}</code></header>
              <div className="review-packet-meta">
                <ReviewField label="Template" value={selectedTemplate?.name} />
                <ReviewField label="Visual" value={selectedVisual?.name} />
                <ReviewField label="Master" value={selectedTemplate?.masterRatio === 'story' ? '1080×1920' : '1080×1350'} />
              </div>
              <div className="review-packet-copy">
                <ReviewField label="Source brief" value={brief} wide />
                <ReviewField label="Headline" value={strategy?.headline} />
                <ReviewField label="Offer" value={strategy?.offer} />
                <ReviewField label="Body copy" value={strategy?.body} wide />
                <ReviewField label="CTA" value={strategy?.cta} />
              </div>
              <div className="review-packet-prompts">
                <ReviewField label="Static image prompt" value={strategy?.imagePrompt} />
                <ReviewField label="Video prompt" value={strategy?.videoPrompt} />
              </div>
            </section>
            <div className="review-panel" data-status={visibleReviewStatus} aria-live="polite">
              <div className="review-icon"><ClipboardCheck size={24} aria-hidden="true" /></div>
              <div>
                <span className="status-label"><span className="status-dot" />{visibleReviewStatus === 'ready' ? 'Packet ready' : visibleReviewStatus === 'in-review' ? 'In review' : 'Approved'}</span>
                <h2>{visibleReviewStatus === 'approved' ? 'Master approved by designer' : 'Composition and quality review'}</h2>
                <p>{visibleReviewStatus === 'approved' ? 'The approved version becomes the source for final resizes.' : 'V1 simulation: the packet is not sent automatically. A designer reviews it in Figma and returns a link to the approved version.'}</p>
                {visibleReviewStatus === 'in-review' && <label className="figma-field" htmlFor="figma-url"><span>Design file / version</span><input id="figma-url" value={figmaUrl} onChange={(event) => setFigmaUrl(event.target.value)} /></label>}
              </div>
              <div className="review-actions">
                {visibleReviewStatus === 'ready' && <PrimaryButton onClick={() => setReviewStatus('in-review')}>Send for review</PrimaryButton>}
                {visibleReviewStatus === 'in-review' && <PrimaryButton disabled={!figmaLinkIsValid} onClick={approveReview}>Confirm review</PrimaryButton>}
                {visibleReviewStatus === 'approved' && <PrimaryButton onClick={() => advance(7)}>Build final package</PrimaryButton>}
                <a href={figmaLinkIsValid ? figmaUrl.trim() : 'https://www.figma.com'} target="_blank" rel="noreferrer">Open Figma <ExternalLink size={14} /></a>
              </div>
            </div>
            <div className="review-checks">
              {['Composition', 'Contrast', 'Text overflow', 'Cropping', 'Motion'].map((item, index) => <span key={item}><i>{visibleReviewStatus === 'approved' ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</i>{item}</span>)}
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(5)}>Back to master</SecondaryButton></StageActions>
          </>
        )}

        {step === 7 && (
          <>
            <StageHeader count="07 / 07" title="Package ready" description="Four compositions have been reflowed from the approved master. This is a browser preview of the final production job." />
            <div className="delivery-summary"><span><Check size={17} />Designer approved</span><span>4 formats</span><span>Static + motion ready</span></div>
            <div className="resize-grid">
              {resizeLayouts.map((format) => (
                <article className="resize-output" key={format.size}>
                  <div className="resize-preview-wrap"><BannerPreview template={selectedTemplate} visual={selectedVisual} content={strategy} ratio={format.ratio} resizeLayout={format.layout} compact /></div>
                  <div><span>{format.label}</span><strong>{format.size}</strong><small>{format.layout}</small></div>
                </article>
              ))}
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(6)}>Review</SecondaryButton><PrimaryButton onClick={downloadManifest}><Download size={15} />Download manifest</PrimaryButton></StageActions>
          </>
        )}
      </section>
    </div>
  )
}

function StageHeader({ count, title, description }) {
  return <header className="stage-header"><span>{count}</span><div><h1>{title}</h1><p>{description}</p></div><div className="stage-mode"><Sparkles size={14} />local generation</div></header>
}

function StageActions({ children }) {
  return <footer className="stage-actions">{children}</footer>
}

function PrimaryButton({ children, ...props }) {
  return <button className="button button--primary" type="button" {...props}>{children}<ArrowRight size={16} aria-hidden="true" /></button>
}

function SecondaryButton({ children, ...props }) {
  return <button className="button button--secondary" type="button" {...props}>{children}</button>
}

function MetaBlock({ label, value }) {
  return <div className="meta-block"><span>{label}</span><strong>{value}</strong></div>
}

function DescriptionRow({ label, value }) {
  return <div className="strategy-summary__row"><dt>{label}</dt><dd>{value}</dd></div>
}

function TextField({ label, value, onChange, multiline = false }) {
  const id = `field-${label}`
  return <label className="text-field" htmlFor={id}><span>{label}</span>{multiline ? <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} /> : <input id={id} value={value} onChange={(event) => onChange(event.target.value)} />}</label>
}

function PromptBlock({ label, value }) {
  return <div className="prompt-block"><span>{label}</span><p>{value}</p></div>
}

function ReviewField({ label, value, wide = false }) {
  return <div className="review-field" data-wide={wide}><strong>{label}</strong><p>{value}</p></div>
}
