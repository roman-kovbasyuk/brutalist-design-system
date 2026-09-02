import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Download } from 'lucide-react'
import { BannerPreview } from '../components/BannerPreview.jsx'
import { BannerWorkspace } from '../components/BannerWorkspace.jsx'
import { ReviewWorkspace } from '../components/ReviewWorkspace.jsx'
import { AssetWorkspace } from '../components/AssetWorkspace.jsx'
import { CopyWorkspace } from '../components/CopyWorkspace.jsx'
import { ProcessingScreen } from '../components/ProcessingScreen.jsx'
import { StepRail } from '../components/StepRail.jsx'
import {
  analyzeBrief,
  createBannerCandidates,
  createStaticAsset,
  createVideoAsset,
  estimateVideoBatch,
  generatePromptIdeas,
  getResizeLayouts,
} from '../domain/campaign.js'
import { readReview, subscribeToReview, writeReview } from '../domain/reviewStore.js'
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
const defaultMotionPreset = { text: 'fade-up', image: 'soft-zoom', cta: 'pop-in', replayVersion: 0 }

function getResumableStep(review) {
  if (!review?.selectedBanners?.length) return 1
  if (review.status === 'approved') return 7
  if (review.status === 'in-review' || review.status === 'ready-for-approval') return 6
  return 1
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function WorkflowScreen({ requestedTemplate, campaignId }) {
  const [step, setStep] = useState(() => getResumableStep(readReview(campaignId)))
  const [maxStep, setMaxStep] = useState(() => getResumableStep(readReview(campaignId)))
  const [brief, setBrief] = useState(initialBrief)
  const [error, setError] = useState('')
  const [strategy, setStrategy] = useState(null)
  const [promptIdeas, setPromptIdeas] = useState([])
  const [processing, setProcessing] = useState(null)
  const [staticAssets, setStaticAssets] = useState([])
  const [videoAssets, setVideoAssets] = useState([])
  const [assetTab, setAssetTab] = useState('prompts')
  const [showVideoCostDialog, setShowVideoCostDialog] = useState(false)
  const [selectedVisualId, setSelectedVisualId] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(requestedTemplate?.id ?? null)
  const [bannerFilters, setBannerFilters] = useState({ format: 'Vertical', platform: 'SMM Static', media: 'static' })
  const [selectedBannerIds, setSelectedBannerIds] = useState([])
  const [activeBannerId, setActiveBannerId] = useState(null)
  const [pendingTemplateId, setPendingTemplateId] = useState(null)
  const [motionByBannerId, setMotionByBannerId] = useState({})
  const [review, setReview] = useState(() => readReview(campaignId))

  useEffect(() => {
    if (!requestedTemplate?.id) return
    setSelectedTemplateId(requestedTemplate.id)
    setPendingTemplateId(requestedTemplate.id)
    setActiveBannerId(null)
    setSelectedBannerIds([])
    invalidateReview()
    if (strategy && selectedVisualId) {
      setStep(4)
      setMaxStep(4)
    }
  }, [requestedTemplate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!processing) return undefined

    const timerId = window.setTimeout(() => {
      if (processing.activeIndex < analysisStates.length - 1) {
        setProcessing((current) => current && { ...current, activeIndex: current.activeIndex + 1 })
        return
      }

      completeAnalysis(processing.strategy)
    }, analysisPhaseDuration)

    return () => window.clearTimeout(timerId)
  }, [processing]) // The timer is replaced and cleared for every deterministic phase.

  const selectedStaticVisual = staticAssets.find((visual) => visual.id === selectedVisualId)
  const linkedVideos = useMemo(() => videoAssets.filter((asset) => asset.sourceStaticId === selectedVisualId), [videoAssets, selectedVisualId])
  const bannerCandidates = useMemo(() => createBannerCandidates({
    strategy,
    templates,
    staticAssets: selectedStaticVisual ? [selectedStaticVisual] : [],
    videoAssets: linkedVideos,
  }), [strategy, selectedStaticVisual, linkedVideos])
  const selectedBanners = selectedBannerIds.map((id) => bannerCandidates.find((candidate) => candidate.id === id)).filter(Boolean)
  const activeBanner = selectedBannerIds.includes(activeBannerId)
    ? bannerCandidates.find((candidate) => candidate.id === activeBannerId)
    : null
  const compatibilityBanner = activeBanner ?? selectedBanners[0] ?? null
  const selectedVisual = staticAssets.find((visual) => visual.id === (compatibilityBanner?.sourceStaticId ?? selectedVisualId))
  const videoEligibleAssets = staticAssets.filter((asset) => !videoAssets.some((video) => video.sourceStaticId === asset.id))
  const videoEstimate = estimateVideoBatch(videoEligibleAssets)
  const reviewStatus = review?.status ?? 'draft'
  const reviewBanners = useMemo(() => selectedBanners.map((candidate) => ({
    ...candidate,
    template: templates.find((template) => template.id === candidate.templateId),
    visual: candidate.mediaType === 'video'
      ? videoAssets.find((asset) => asset.id === candidate.sourceAssetId)
      : staticAssets.find((asset) => asset.id === candidate.sourceAssetId),
    content: {
      headline: strategy?.headline ?? '',
      body: strategy?.body ?? '',
      offer: strategy?.offer ?? '',
      cta: strategy?.cta ?? '',
    },
    motionPreset: { ...defaultMotionPreset, ...motionByBannerId[candidate.id] },
  })), [motionByBannerId, selectedBanners, staticAssets, strategy, videoAssets])
  const deliveryBanners = review?.selectedBanners ?? []
  const hasPersistedReviewPackage = reviewStatus !== 'draft' && deliveryBanners.length > 0
  const hasReviewPackage = selectedBannerIds.length > 0 || hasPersistedReviewPackage
  const isPersistedOnlyWorkflow = hasPersistedReviewPackage
    && !strategy
    && staticAssets.length === 0
    && videoAssets.length === 0
  const visibleReviewBanners = reviewStatus === 'draft' ? reviewBanners : deliveryBanners
  const deliveryOutputs = useMemo(() => deliveryBanners.flatMap((banner) => getResizeLayouts(banner.template).map((format) => ({ ...format, banner }))), [deliveryBanners])
  const generatedAssets = review?.generatedAssets ?? [...staticAssets, ...videoAssets]
  const productionCost = getProductionCost(generatedAssets)
  const selectedVideoCount = deliveryBanners.filter((banner) => banner.mediaType === 'video').length

  useEffect(() => {
    const persistedReview = readReview(campaignId)
    const resumedStep = getResumableStep(persistedReview)
    setStep(resumedStep)
    setMaxStep(resumedStep)
    setBrief(initialBrief)
    setError('')
    setStrategy(null)
    setPromptIdeas([])
    setProcessing(null)
    setStaticAssets([])
    setVideoAssets([])
    setAssetTab('prompts')
    setShowVideoCostDialog(false)
    setSelectedVisualId(null)
    setSelectedTemplateId(requestedTemplate?.id ?? null)
    setBannerFilters({ format: 'Vertical', platform: 'SMM Static', media: 'static' })
    setSelectedBannerIds([])
    setActiveBannerId(null)
    setPendingTemplateId(null)
    setMotionByBannerId({})
    setReview(persistedReview)
    return subscribeToReview(campaignId, setReview)
  }, [campaignId]) // A new URL campaign must never inherit the prior campaign's local workflow state.

  useEffect(() => {
    if (reviewStatus !== 'draft' || step < 6) return

    const nextPermittedStep = reviewBanners.length > 0 ? 5 : 4
    setStep(nextPermittedStep)
    setMaxStep((current) => Math.min(current, nextPermittedStep))
  }, [reviewBanners.length, reviewStatus, step])

  useEffect(() => {
    if (!pendingTemplateId || bannerCandidates.length === 0) return
    const candidate = bannerCandidates.find((item) => item.templateId === pendingTemplateId && item.mediaType === bannerFilters.media)
      ?? bannerCandidates.find((item) => item.templateId === pendingTemplateId)
    if (!candidate) return

    setBannerFilters({ format: candidate.format, platform: candidate.platform, media: candidate.mediaType })
    setActiveBannerId(candidate.id)
    setPendingTemplateId(null)
  }, [bannerCandidates, bannerFilters.media, pendingTemplateId])

  useEffect(() => {
    if (bannerCandidates.length === 0) {
      setActiveBannerId(null)
      return
    }
    setActiveBannerId((current) => bannerCandidates.some((candidate) => candidate.id === current) ? current : null)
  }, [bannerCandidates])

  function advance(nextStep) {
    if (nextStep === 5 && !hasReviewPackage) return
    if (nextStep === 6 && !hasPersistedReviewPackage) return
    if (nextStep === 7 && (reviewStatus !== 'approved' || deliveryBanners.length === 0)) return
    setStep(nextStep)
    setMaxStep((current) => Math.max(current, nextStep))
  }

  function changeStep(nextStep) {
    if (isPersistedOnlyWorkflow && nextStep < 5) return
    if (nextStep === 5 && !hasReviewPackage) return
    if (nextStep === 6 && !hasPersistedReviewPackage) return
    if (nextStep === 7 && (reviewStatus !== 'approved' || deliveryBanners.length === 0)) return
    setStep(nextStep)
  }

  function invalidateReview() {
    if (!review || !['in-review', 'ready-for-approval', 'approved'].includes(review.status)) return
    writeReview(campaignId, {
      ...review,
      status: 'draft',
      invalidatedAt: new Date().toISOString(),
      reviewedAt: null,
      approvedAt: null,
      designerName: null,
      marketerName: null,
    })
  }

  function handleAnalyze() {
    try {
      const nextStrategy = analyzeBrief(brief)
      setError('')
      if (prefersReducedMotion()) {
        completeAnalysis(nextStrategy)
        return
      }
      setProcessing({ strategy: nextStrategy, activeIndex: 0 })
    } catch (nextError) {
      setError(nextError.message)
    }
  }

  function completeAnalysis(nextStrategy) {
    setStrategy(nextStrategy)
    setPromptIdeas(generatePromptIdeas(nextStrategy))
    setStaticAssets([])
    setVideoAssets([])
    setAssetTab('prompts')
    setShowVideoCostDialog(false)
    setSelectedVisualId(null)
    setSelectedBannerIds([])
    setActiveBannerId(null)
    setMotionByBannerId({})
    invalidateReview()
    setProcessing(null)
    setStep(2)
    setMaxStep((current) => Math.max(current, 2))
  }

  function updateStrategy(field, value) {
    invalidateReview()
    setStrategy((current) => ({ ...current, [field]: value }))
    setStaticAssets([])
    setVideoAssets([])
    setAssetTab('prompts')
    setShowVideoCostDialog(false)
    setSelectedVisualId(null)
    setPendingTemplateId(null)
    setSelectedBannerIds([])
    setActiveBannerId(null)
    setMotionByBannerId({})
    setMaxStep((current) => Math.min(current, 2))
  }

  function updateBrief(value) {
    invalidateReview()
    setBrief(value)
    setStrategy(null)
    setPromptIdeas([])
    setProcessing(null)
    setStaticAssets([])
    setVideoAssets([])
    setAssetTab('prompts')
    setShowVideoCostDialog(false)
    setSelectedVisualId(null)
    setSelectedTemplateId(null)
    setPendingTemplateId(null)
    setSelectedBannerIds([])
    setActiveBannerId(null)
    setMotionByBannerId({})
    setMaxStep(1)
  }

  function selectVisual(visualId) {
    invalidateReview()
    setSelectedVisualId(visualId)
    setSelectedBannerIds([])
    setActiveBannerId(null)
    setMotionByBannerId({})
    setMaxStep((current) => Math.min(current, 4))
  }

  function generateStaticAsset(prompt) {
    const asset = createStaticAsset(prompt)
    setStaticAssets((current) => current.some((item) => item.id === asset.id) ? current : [...current, asset])
    setSelectedVisualId((current) => current ?? asset.id)
  }

  function updatePrompt(promptId, changes) {
    invalidateReview()
    setPromptIdeas((current) => current.map((prompt) => prompt.id === promptId ? { ...prompt, ...changes } : prompt))
  }

  function deletePrompt(promptId) {
    invalidateReview()
    setPromptIdeas((current) => current.filter((prompt) => prompt.id !== promptId))
  }

  function downloadPrompt(prompt) {
    const safeName = prompt.title
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'prompt'
    const contents = `${prompt.title}\n\n${prompt.prompt}\n`
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${safeName}-prompt.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function renameStaticAsset(assetId, name) {
    invalidateReview()
    setStaticAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, name } : asset))
  }

  function renameVideoAsset(assetId, name) {
    invalidateReview()
    setVideoAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, name } : asset))
  }

  function clearBannerDrafts() {
    setSelectedBannerIds([])
    setActiveBannerId(null)
    setMotionByBannerId({})
    setMaxStep((current) => Math.min(current, 3))
  }

  function deleteStaticAsset(assetId) {
    invalidateReview()
    const remaining = staticAssets.filter((asset) => asset.id !== assetId)
    setStaticAssets(remaining)
    setVideoAssets((current) => current.filter((asset) => asset.sourceStaticId !== assetId))
    setSelectedVisualId((current) => current === assetId ? remaining[0]?.id ?? null : current)
    clearBannerDrafts()
  }

  function deleteVideoAsset(assetId) {
    invalidateReview()
    setVideoAssets((current) => current.filter((asset) => asset.id !== assetId))
    clearBannerDrafts()
  }

  function downloadGeneratedAsset(asset) {
    const safeName = asset.name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || asset.mediaType
    const kind = asset.mediaType === 'video' ? 'video' : 'image'
    const url = URL.createObjectURL(new Blob([JSON.stringify(asset, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${safeName}-${kind}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function generateVideoAsset(staticAsset) {
    const asset = createVideoAsset(staticAsset)
    setVideoAssets((current) => current.some((item) => item.id === asset.id) ? current : [...current, asset])
  }

  function viewSourceStaticAsset(staticId) {
    selectVisual(staticId)
    setAssetTab('static')
  }

  function confirmVideoBatch() {
    setVideoAssets((current) => {
      const existing = new Set(current.map((asset) => asset.id))
      const missing = staticAssets
        .filter((staticAsset) => !existing.has(createVideoAsset(staticAsset).id))
        .map(createVideoAsset)
      return [...current, ...missing]
    })
    setShowVideoCostDialog(false)
  }

  function selectBannerCandidate(candidateId) {
    setActiveBannerId(candidateId)
    const candidate = bannerCandidates.find((item) => item.id === candidateId)
    if (candidate) setSelectedTemplateId(candidate.templateId)
  }

  function updateSelectedBanners(nextBannerIds) {
    if (nextBannerIds.join('|') !== selectedBannerIds.join('|')) invalidateReview()
    setSelectedBannerIds(nextBannerIds)
    if (nextBannerIds.length === 0) {
      setMaxStep((current) => Math.min(current, 4))
      setStep((current) => Math.min(current, 4))
    }
  }

  function updateBannerMotion(bannerId, channel, preset) {
    invalidateReview()
    setMotionByBannerId((current) => ({
      ...current,
      [bannerId]: {
        ...(current[bannerId] ?? {}),
        [channel]: preset,
        replayVersion: (current[bannerId]?.replayVersion ?? 0) + 1,
      },
    }))
  }

  function replayBannerMotion(bannerId) {
    setMotionByBannerId((current) => ({
      ...current,
      [bannerId]: {
        ...(current[bannerId] ?? {}),
        replayVersion: (current[bannerId]?.replayVersion ?? 0) + 1,
      },
    }))
  }

  function submitReviewPackage() {
    const submittedAt = new Date().toISOString()
    const packageRecord = {
      status: 'in-review',
      figmaUrl: `https://www.figma.com/file/${campaignId}/lingu-studio-review`,
      selectedBanners: reviewBanners,
      selectedBannerIds: reviewBanners.map((banner) => banner.id),
      motionByBannerId: reviewBanners.reduce((allMotion, banner) => ({
        ...allMotion,
        [banner.id]: banner.motionPreset ?? {},
      }), {}),
      generatedAssets: [...staticAssets, ...videoAssets],
      submittedAt,
      reviewedAt: null,
      approvedAt: null,
      designerName: null,
      marketerName: null,
      simulation: 'local',
    }
    writeReview(campaignId, packageRecord)
    setMaxStep((current) => Math.max(current, 6))
  }

  function confirmReview() {
    if (reviewStatus !== 'ready-for-approval' || !review) return
    writeReview(campaignId, {
      ...review,
      status: 'approved',
      marketerName: 'Maya Chen',
      approvedAt: new Date().toISOString(),
    })
    setMaxStep(7)
    setStep(7)
  }

  function downloadPackage(filename, payload) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function downloadAssets() {
    downloadPackage('lingu-studio-simulated-assets.json', {
      simulation: 'local',
      kind: 'simulated-assets',
      assets: deliveryOutputs.map(serializeDeliveryOutput),
    })
  }

  function serializeDeliveryOutput({ banner, ...format }) {
    return {
      bannerId: banner.id,
      templateId: banner.templateId,
      sourceAssetId: banner.sourceAssetId,
      mediaType: banner.mediaType,
      motionPreset: banner.motionPreset ?? {},
      ...format,
    }
  }

  return (
    <div className="workflow-layout">
      <StepRail currentStep={processing ? null : step} maxStep={maxStep} onStepChange={changeStep} />
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
            <StageHeader count="02 / 07" title="Copy" description="Refine the campaign message and review five visual moments generated from the brief." />
            <CopyWorkspace strategy={strategy} promptIdeas={promptIdeas} onCopyChange={updateStrategy} />
            <StageActions><SecondaryButton onClick={() => setStep(1)}>Back</SecondaryButton><PrimaryButton onClick={() => advance(3)}>Generate visuals</PrimaryButton></StageActions>
          </>
        )}

        {step === 3 && (
          <>
            <StageHeader count="03 / 07" title="AI assets" description="Turn prompt directions into static visuals and locally simulated motion assets." />
            <AssetWorkspace
              activeTab={assetTab}
              promptIdeas={promptIdeas}
              staticAssets={staticAssets}
              videoAssets={videoAssets}
              selectedStaticId={selectedVisualId}
              videoEstimate={videoEstimate}
              showCostDialog={showVideoCostDialog}
              onTabChange={setAssetTab}
              onUpdatePrompt={updatePrompt}
              onDeletePrompt={deletePrompt}
              onDownloadPrompt={downloadPrompt}
              onDownloadAsset={downloadGeneratedAsset}
              onRenameStatic={renameStaticAsset}
              onDeleteStatic={deleteStaticAsset}
              onRenameVideo={renameVideoAsset}
              onDeleteVideo={deleteVideoAsset}
              onGenerateStatic={generateStaticAsset}
              onGenerateVideo={generateVideoAsset}
              onSelectStatic={selectVisual}
              onViewSource={viewSourceStaticAsset}
              onRequestVideoBatch={() => setShowVideoCostDialog(true)}
              onCancelVideoBatch={() => setShowVideoCostDialog(false)}
              onConfirmVideoBatch={confirmVideoBatch}
            />
            <StageActions><SecondaryButton onClick={() => setStep(2)}>Back to Copy</SecondaryButton><PrimaryButton disabled={staticAssets.length === 0} onClick={() => advance(4)}>Continue to banner preview</PrimaryButton></StageActions>
          </>
        )}

        {step === 4 && (
          <>
            <StageHeader count="04 / 07" title="Banner preview" description="Compare 20 compositions for the selected visual, then choose the drafts to assemble in Figma." />
            <BannerWorkspace
              candidates={bannerCandidates}
              templates={templates}
              staticAssets={staticAssets}
              videoAssets={videoAssets}
              content={strategy}
              filters={bannerFilters}
              onFiltersChange={setBannerFilters}
              selectedBannerIds={selectedBannerIds}
              onSelectedBannerIdsChange={updateSelectedBanners}
              activeBannerId={activeBannerId}
              onActiveBannerChange={selectBannerCandidate}
              motionByBannerId={motionByBannerId}
              onMotionChange={updateBannerMotion}
              onReplayMotion={replayBannerMotion}
            />
            <StageActions><SecondaryButton onClick={() => setStep(3)}>Back</SecondaryButton><PrimaryButton disabled={selectedBannerIds.length === 0} onClick={() => advance(5)}>Continue to prepare for review</PrimaryButton></StageActions>
          </>
        )}

        {step === 5 && visibleReviewBanners.length > 0 && (
          <>
            <StageHeader count="05 / 07" title="Prepare for review" description="Review every selected banner before sending the immutable local package to the designer endpoint." />
            <ReviewWorkspace banners={visibleReviewBanners} status={reviewStatus} />
            {reviewStatus === 'draft' ? (
              <StageActions><SecondaryButton onClick={() => changeStep(4)}>Back to banner preview</SecondaryButton><PrimaryButton onClick={submitReviewPackage}>Send to Figma for review</PrimaryButton></StageActions>
            ) : (
              <>
                <section className="review-submission-status" data-status={reviewStatus} aria-live="polite">
                  <strong>{reviewStatus === 'in-review' ? 'In review' : reviewStatus === 'ready-for-approval' ? 'Ready for approval' : 'Approved'}</strong>
                  <a className="review-figma-link" href={review?.figmaUrl} target="_blank" rel="noreferrer">Open Figma review</a>
                  <p>You will be notified by email and Slack</p>
                  <p className="local-simulation-label">Local simulation</p>
                </section>
                <StageActions><SecondaryButton onClick={() => changeStep(4)}>Back to banner preview</SecondaryButton><PrimaryButton onClick={() => advance(6)}>Continue to Approval</PrimaryButton></StageActions>
              </>
            )}
          </>
        )}

        {step === 6 && (
          <>
            <StageHeader count="06 / 07" title="Approval" description="The marketer confirms the designer’s locally persisted review before delivery is unlocked." />
            <section className="approval-panel" data-status={reviewStatus} aria-live="polite">
              {reviewStatus === 'ready-for-approval' ? (
                <>
                  <span className="status-label">Ready for approval</span>
                  <h2>Banners are ready for approval</h2>
                  <p>{review?.designerName || 'Jordan Lee'}’s designer review is recorded. Confirming records Maya Chen as the marketer approver.</p>
                  <PrimaryButton onClick={confirmReview}>Confirm review</PrimaryButton>
                </>
              ) : reviewStatus === 'approved' ? (
                <>
                  <span className="status-label">Approved</span>
                  <h2>Review confirmed</h2>
                  <p>Delivery is available for the current approved package.</p>
                  <PrimaryButton onClick={() => advance(7)}>Open Delivery</PrimaryButton>
                </>
              ) : (
                <>
                  <span className="status-label">Waiting for designer</span>
                  <h2>Waiting for designer review</h2>
                  <p>The review package is in local simulation. Delivery remains locked until the designer marks it ready for approval.</p>
                  <a className="button button--secondary" href={`/review/${campaignId}`}>Open designer review</a>
                </>
              )}
            </section>
            <StageActions><SecondaryButton onClick={() => setStep(5)}>Back to Prepare for review</SecondaryButton></StageActions>
          </>
        )}

        {step === 7 && reviewStatus === 'approved' && (
          <>
            <StageHeader count="07 / 07" title="Delivery" description="Responsive production formats are generated locally from every approved selected banner." />
            <ul className="delivery-summary" aria-label="Production summary">
              <li><Check size={17} aria-hidden="true" />Designer reviewed: {review?.designerName ?? 'Not recorded'}</li>
              <li>Marketer approved: {review?.marketerName ?? 'Not recorded'}</li>
              <li>Formats: {new Set(deliveryOutputs.map((output) => output.label)).size}</li>
              <li>Selected video count: {selectedVideoCount}</li>
              <li>Total assets: {deliveryOutputs.length}</li>
              <li>Total simulated production cost: {formatCurrency(productionCost)}</li>
            </ul>
            <div className="resize-grid">
              {deliveryOutputs.map(({ banner, ...format }) => (
                <article className="resize-output" key={`${banner.id}-${format.size}`}>
                  <div className="resize-preview-wrap"><BannerPreview template={banner.template} visual={banner.visual} content={banner.content} ratio={format.ratio} resizeLayout={format.layout} compact motionPreset={banner.motionPreset} motionVersion={banner.motionPreset?.replayVersion ?? 0} /></div>
                  <div><span>{banner.templateName} · {format.label}</span><strong>{format.size}</strong><small>{format.layout}</small></div>
                </article>
              ))}
            </div>
            <StageActions><PrimaryButton onClick={downloadAssets}><Download size={15} />Download assets</PrimaryButton></StageActions>
          </>
        )}
      </section>
    </div>
  )
}

function StageHeader({ count, title, description }) {
  return <header className="stage-header"><span>{count}</span><div><h1>{title}</h1><p>{description}</p></div></header>
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

function getProductionCost(assets) {
  const uniqueAssets = [...new Map(assets.map((asset) => [asset.id, asset])).values()]
  const staticCount = uniqueAssets.filter((asset) => asset.mediaType === 'static').length
  const videoCount = uniqueAssets.filter((asset) => asset.mediaType === 'video').length
  return Number((staticCount * 0.12 + videoCount * 1.8).toFixed(2))
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}
