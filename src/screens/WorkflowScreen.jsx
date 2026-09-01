import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, ClipboardCheck, Download, ExternalLink, Sparkles } from 'lucide-react'
import { BannerPreview } from '../components/BannerPreview.jsx'
import { StepRail } from '../components/StepRail.jsx'
import { TemplateCard } from '../components/TemplateCard.jsx'
import { VisualArtwork } from '../components/VisualArtwork.jsx'
import {
  analyzeBrief,
  createCreativeFingerprint,
  generateVisuals,
  getContentWarnings,
  getResizeLayouts,
  isApprovalCurrent,
  isValidFigmaUrl,
} from '../domain/campaign.js'
import { templates } from '../data/templates.js'

const initialBrief = 'Запускаем интенсив норвежского языка для людей, которые собираются переехать в Осло. Скидка 15% до воскресенья. Нужно показать, что человек сможет говорить в бытовых ситуациях уже во время курса.'

export function WorkflowScreen({ requestedTemplate }) {
  const [step, setStep] = useState(1)
  const [maxStep, setMaxStep] = useState(1)
  const [brief, setBrief] = useState(initialBrief)
  const [error, setError] = useState('')
  const [strategy, setStrategy] = useState(null)
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
      setStrategy(nextStrategy)
      setVisuals(generateVisuals(nextStrategy))
      setSelectedVisualId(null)
      setReviewStatus('ready')
      setApprovedFingerprint(null)
      setError('')
      advance(2)
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
      <StepRail currentStep={step} maxStep={maxStep} onStepChange={setStep} />
      <section className="workflow-stage" key={step}>
        {step === 1 && (
          <>
            <StageHeader count="01 / 07" title="Расскажите идею кампании" description="Свободный бриф — единственное обязательное поле. Копирайт и промпты система подготовит сама." />
            <div className="stage-grid stage-grid--brief">
              <div className="field-group field-group--large">
                <label htmlFor="campaign-brief">Идея кампании</label>
                <textarea id="campaign-brief" value={brief} onChange={(event) => updateBrief(event.target.value)} />
                <div className="field-meta"><span>{brief.length} символов</span><span>Можно писать в свободной форме</span></div>
                {error && <p className="inline-error" role="alert">{error}</p>}
              </div>
              <aside className="brief-aside">
                <p>Система найдёт</p>
                <ul><li>аудиторию и цель</li><li>оффер и CTA</li><li>структуру сообщения</li><li>промпты для image/video</li></ul>
                <span>Demo-mode использует локальный генератор. Данные никуда не отправляются.</span>
              </aside>
            </div>
            <StageActions><PrimaryButton onClick={handleAnalyze}>Разобрать бриф</PrimaryButton></StageActions>
          </>
        )}

        {step === 2 && strategy && (
          <>
            <StageHeader count="02 / 07" title="Сообщение и промпты" description="Это рабочая интерпретация брифа. Текст можно поправить до генерации визуалов." />
            <div className="strategy-summary">
              <MetaBlock label="Аудитория" value={strategy.audience} />
              <MetaBlock label="Цель" value={strategy.goal} />
              <MetaBlock label="Оффер" value={strategy.offer} />
            </div>
            <div className="copy-editor">
              <TextField label="Заголовок" value={strategy.headline} onChange={(value) => updateStrategy('headline', value)} />
              <TextField label="Основной текст" value={strategy.body} onChange={(value) => updateStrategy('body', value)} multiline />
              <TextField label="CTA" value={strategy.cta} onChange={(value) => updateStrategy('cta', value)} />
            </div>
            <div className="prompt-grid">
              <PromptBlock label="Static image prompt" value={strategy.imagePrompt} />
              <PromptBlock label="Video prompt" value={strategy.videoPrompt} />
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(1)}>Назад</SecondaryButton><PrimaryButton onClick={() => advance(3)}>Создать визуалы</PrimaryButton></StageActions>
          </>
        )}

        {step === 3 && (
          <>
            <StageHeader count="03 / 07" title="Выберите визуальное направление" description="Пять вариантов основаны на одном сообщении, но отличаются характером изображения и движением." />
            <div className="visual-grid">
              {visuals.map((visual, index) => (
                <article className="visual-option" data-selected={selectedVisualId === visual.id} key={visual.id}>
                  <button type="button" aria-label={`Выбрать визуал ${visual.name}`} aria-pressed={selectedVisualId === visual.id} onClick={() => selectVisual(visual.id)}>
                    <VisualArtwork visual={visual} />
                    <span className="visual-option-meta"><span>{String(index + 1).padStart(2, '0')} · {visual.direction}</span><strong>{visual.name}</strong></span>
                  </button>
                  <details><summary>Показать промпт</summary><p>{visual.prompt}</p></details>
                </article>
              ))}
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(2)}>Назад</SecondaryButton><PrimaryButton disabled={!selectedVisualId} onClick={() => advance(4)}>Перейти к шаблонам</PrimaryButton></StageActions>
          </>
        )}

        {step === 4 && (
          <>
            <StageHeader count="04 / 07" title="Выберите композицию" description="Шаблон определяет иерархию и баланс. Текст и выбранный визуал останутся теми же." />
            <div className="template-picker">
              {templates.map((template) => <TemplateCard key={template.id} template={template} selected={selectedTemplateId === template.id} onChoose={selectTemplate} mode="picker" />)}
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(3)}>Назад</SecondaryButton><PrimaryButton disabled={!selectedTemplateId} onClick={() => advance(5)}>Собрать черновик</PrimaryButton></StageActions>
          </>
        )}

        {step === 5 && selectedTemplate && (
          <>
            <StageHeader count="05 / 07" title="Черновой мастер" description="Текст, визуал и композиция собраны. Сейчас это preview, а не финальный креатив." />
            <div className="assembly-grid">
              <div className="master-preview"><BannerPreview template={selectedTemplate} visual={selectedVisual} content={strategy} /></div>
              <aside className="assembly-spec">
                <p className="spec-title">Сборка</p>
                <MetaBlock label="Шаблон" value={`${String(selectedTemplate.index).padStart(2, '0')} · ${selectedTemplate.name}`} />
                <MetaBlock label="Визуал" value={selectedVisual?.name} />
                <MetaBlock label="Мастер" value={selectedTemplate.masterRatio === 'story' ? '1080×1920' : '1080×1350'} />
                <MetaBlock label="Анимация" value={selectedTemplate.motion} />
                {copyWarnings.length === 0 ? (
                  <div className="check-list"><p><Check size={15} /> Автопроверка: текст в пределах лимитов</p><p>Контраст и safe zones проверит дизайнер</p></div>
                ) : (
                  <div className="content-warning" role="alert"><AlertTriangle size={17} /><div><strong>Нужно проверить текст</strong>{copyWarnings.map((warning) => <span key={warning}>{warning}</span>)}</div></div>
                )}
              </aside>
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(4)}>Сменить шаблон</SecondaryButton><PrimaryButton onClick={() => advance(6)}>Подготовить Figma-пакет</PrimaryButton></StageActions>
          </>
        )}

        {step === 6 && (
          <>
            <StageHeader count="06 / 07" title="Дизайнерское ревью" description="Финальный рендер заблокирован, пока дизайнер не проверит мастер в Figma." />
            <section className="review-packet" aria-label="Review packet">
              <header><span>Review packet · local simulation</span><code>{selectedTemplate?.id}</code></header>
              <div className="review-packet-meta">
                <ReviewField label="Шаблон" value={selectedTemplate?.name} />
                <ReviewField label="Визуал" value={selectedVisual?.name} />
                <ReviewField label="Мастер" value={selectedTemplate?.masterRatio === 'story' ? '1080×1920' : '1080×1350'} />
              </div>
              <div className="review-packet-copy">
                <ReviewField label="Исходный бриф" value={brief} wide />
                <ReviewField label="Заголовок" value={strategy?.headline} />
                <ReviewField label="Оффер" value={strategy?.offer} />
                <ReviewField label="Основной текст" value={strategy?.body} wide />
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
                <span className="status-label"><span className="status-dot" />{visibleReviewStatus === 'ready' ? 'Пакет готов' : visibleReviewStatus === 'in-review' ? 'На проверке' : 'Проверено'}</span>
                <h2>{visibleReviewStatus === 'approved' ? 'Макет утверждён дизайнером' : 'Проверка композиции и качества'}</h2>
                <p>{visibleReviewStatus === 'approved' ? 'Утверждённая версия становится источником для финальных ресайзов.' : 'Симуляция V1: пакет не отправляется автоматически. Дизайнер проверяет его в Figma и возвращает ссылку на утверждённую версию.'}</p>
                {visibleReviewStatus === 'in-review' && <label className="figma-field" htmlFor="figma-url"><span>Ссылка на макет / версия</span><input id="figma-url" value={figmaUrl} onChange={(event) => setFigmaUrl(event.target.value)} /></label>}
              </div>
              <div className="review-actions">
                {visibleReviewStatus === 'ready' && <PrimaryButton onClick={() => setReviewStatus('in-review')}>Отправить на ревью</PrimaryButton>}
                {visibleReviewStatus === 'in-review' && <PrimaryButton disabled={!figmaLinkIsValid} onClick={approveReview}>Подтвердить ревью</PrimaryButton>}
                {visibleReviewStatus === 'approved' && <PrimaryButton onClick={() => advance(7)}>Собрать финальный пакет</PrimaryButton>}
                <a href={figmaLinkIsValid ? figmaUrl.trim() : 'https://www.figma.com'} target="_blank" rel="noreferrer">Открыть Figma <ExternalLink size={14} /></a>
              </div>
            </div>
            <div className="review-checks">
              {['Композиция', 'Контраст', 'Переполнение', 'Кадрирование', 'Анимация'].map((item, index) => <span key={item}><i>{visibleReviewStatus === 'approved' ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</i>{item}</span>)}
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(5)}>Назад к мастеру</SecondaryButton></StageActions>
          </>
        )}

        {step === 7 && (
          <>
            <StageHeader count="07 / 07" title="Пакет готов" description="Четыре композиции перестроены из утверждённого мастера. Это browser preview финального production job." />
            <div className="delivery-summary"><span><Check size={17} />Designer approved</span><span>4 формата</span><span>Static + motion ready</span></div>
            <div className="resize-grid">
              {resizeLayouts.map((format) => (
                <article className="resize-output" key={format.size}>
                  <div className="resize-preview-wrap"><BannerPreview template={selectedTemplate} visual={selectedVisual} content={strategy} ratio={format.ratio} resizeLayout={format.layout} compact /></div>
                  <div><span>{format.label}</span><strong>{format.size}</strong><small>{format.layout}</small></div>
                </article>
              ))}
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(6)}>Ревью</SecondaryButton><PrimaryButton onClick={downloadManifest}><Download size={15} />Скачать manifest</PrimaryButton></StageActions>
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
