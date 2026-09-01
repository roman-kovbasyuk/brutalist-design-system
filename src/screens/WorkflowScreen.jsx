import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, ClipboardCheck, Download, ExternalLink, RefreshCw, Sparkles } from 'lucide-react'
import { BannerPreview } from '../components/BannerPreview.jsx'
import { StepRail } from '../components/StepRail.jsx'
import { TemplateCard } from '../components/TemplateCard.jsx'
import { VisualArtwork } from '../components/VisualArtwork.jsx'
import { analyzeBrief, generateVisuals, getResizeLayouts } from '../domain/campaign.js'
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
  const [selectedTemplateId, setSelectedTemplateId] = useState(requestedTemplate)
  const [reviewStatus, setReviewStatus] = useState('ready')

  useEffect(() => {
    if (requestedTemplate) setSelectedTemplateId(requestedTemplate)
  }, [requestedTemplate])

  const selectedVisual = visuals.find((visual) => visual.id === selectedVisualId)
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId)
  const resizeLayouts = useMemo(() => getResizeLayouts(selectedTemplate), [selectedTemplate])

  function advance(nextStep) {
    setStep(nextStep)
    setMaxStep((current) => Math.max(current, nextStep))
  }

  function handleAnalyze() {
    try {
      const nextStrategy = analyzeBrief(brief)
      setStrategy(nextStrategy)
      setVisuals(generateVisuals(nextStrategy))
      setError('')
      advance(2)
    } catch (nextError) {
      setError(nextError.message)
    }
  }

  function updateStrategy(field, value) {
    setStrategy((current) => ({ ...current, [field]: value }))
  }

  function downloadManifest() {
    const payload = {
      version: 1,
      brief,
      strategy,
      selectedVisual,
      selectedTemplate,
      reviewStatus,
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
                <textarea id="campaign-brief" value={brief} onChange={(event) => setBrief(event.target.value)} />
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
                  <button type="button" aria-label={`Выбрать визуал ${visual.name}`} onClick={() => setSelectedVisualId(visual.id)}>
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
              {templates.map((template) => <TemplateCard key={template.id} template={template} selected={selectedTemplateId === template.id} onChoose={setSelectedTemplateId} mode="picker" />)}
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
                <div className="check-list"><p><Check size={15} /> Контент помещается</p><p><Check size={15} /> Контраст AA</p><p><Check size={15} /> Safe zones учтены</p></div>
              </aside>
            </div>
            <StageActions><SecondaryButton onClick={() => setStep(4)}>Сменить шаблон</SecondaryButton><PrimaryButton onClick={() => advance(6)}>Подготовить Figma-пакет</PrimaryButton></StageActions>
          </>
        )}

        {step === 6 && (
          <>
            <StageHeader count="06 / 07" title="Дизайнерское ревью" description="Финальный рендер заблокирован, пока дизайнер не проверит мастер в Figma." />
            <div className="review-panel" data-status={reviewStatus}>
              <div className="review-icon"><ClipboardCheck size={24} aria-hidden="true" /></div>
              <div>
                <span className="status-label"><span className="status-dot" />{reviewStatus === 'ready' ? 'Пакет готов' : reviewStatus === 'in-review' ? 'На проверке' : 'Проверено'}</span>
                <h2>{reviewStatus === 'approved' ? 'Макет утверждён дизайнером' : 'Проверка композиции и качества'}</h2>
                <p>{reviewStatus === 'approved' ? 'Утверждённая версия становится источником для финальных ресайзов.' : 'Дизайнер проверит переполнение, контраст, кадрирование, safe zones и согласованность анимации.'}</p>
              </div>
              <div className="review-actions">
                {reviewStatus === 'ready' && <PrimaryButton onClick={() => setReviewStatus('in-review')}>Отправить на ревью</PrimaryButton>}
                {reviewStatus === 'in-review' && <PrimaryButton onClick={() => setReviewStatus('approved')}>Подтвердить ревью</PrimaryButton>}
                {reviewStatus === 'approved' && <PrimaryButton onClick={() => advance(7)}>Собрать финальный пакет</PrimaryButton>}
                <a href="https://www.figma.com" target="_blank" rel="noreferrer">Открыть Figma <ExternalLink size={14} /></a>
              </div>
            </div>
            <div className="review-checks">
              {['Композиция', 'Контраст', 'Переполнение', 'Кадрирование', 'Анимация'].map((item, index) => <span key={item}><i>{reviewStatus === 'approved' ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</i>{item}</span>)}
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
                  <div className="resize-preview-wrap"><BannerPreview template={selectedTemplate} visual={selectedVisual} content={strategy} ratio={format.ratio} compact /></div>
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
  return <div className="prompt-block"><span>{label}</span><p>{value}</p><button type="button" aria-label={`Перегенерировать ${label}`}><RefreshCw size={14} aria-hidden="true" /></button></div>
}
