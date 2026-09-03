import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  CircleDot,
  Layers3,
  MessageSquare,
  PenTool,
  Send,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react'

const pipeline = [
  ['01', 'Бриф', 'Один контекст кампании вместо длинной формы.'],
  ['02', 'Copy', 'AI предлагает варианты, маркетолог выбирает и редактирует.'],
  ['03', 'AI assets', 'Генерируются изображения; видео остаётся опциональным.'],
  ['04', 'Templates', 'Выбранные визуалы собираются в опубликованные шаблоны.'],
  ['05', 'Figma review', 'Дизайнер получает editable frames через Bridge Plugin.'],
  ['06', 'Delivery', 'После approval создаются финальные PNG, MP4 и ZIP.'],
]

const teamRoles = [
  {
    id: 'ira',
    eyebrow: '01 / EXPERIENCE',
    name: 'Ira — UX/UI и design engineering',
    accent: 'accent-blue',
    icon: PenTool,
    summary: 'Делает процесс понятным, спокойным и честным для маркетолога и дизайнера.',
    outputs: ['User journeys и wireflows', 'UI state/copy matrix', 'Component behavior и accessibility', 'Responsive и visual QA'],
  },
  {
    id: 'vlad',
    eyebrow: '02 / VISUAL SYSTEM',
    name: 'Vlad — визуальная система и шаблоны',
    accent: 'accent-yellow',
    icon: Boxes,
    summary: 'Создаёт Figma library, visual language и шаблоны, которые приложение умеет собирать.',
    outputs: ['Variables и semantic tokens', '3–5 template directions', 'Slots, safe zones и limits', 'Published reference template'],
  },
  {
    id: 'roman',
    eyebrow: '03 / PRODUCT ENGINEERING',
    name: 'Roman + Codex — приложение и интеграции',
    accent: 'accent-green',
    icon: Workflow,
    summary: 'Строит платформу, AI jobs, renderer, plugin bridge, webhooks и проверяемый golden path.',
    outputs: ['State machine и API contracts', 'Generation и safety pipeline', 'Figma/Slack integrations', 'E2E tests и observability'],
  },
]

const pluginCommands = [
  {
    number: '01',
    title: 'Publish Template',
    label: 'Для Vlad',
    icon: Boxes,
    description: 'Проверяет Figma component, slots, ratios, variables и constraints, затем публикует versioned manifest в Lingu Studio.',
    result: 'Template ID + version + checksum',
  },
  {
    number: '02',
    title: 'Import Review Package',
    label: 'Для дизайнера',
    icon: Layers3,
    description: 'Получает immutable package, создаёт REVIEW frames и root wrappers, добавляет media и copy, возвращает node mapping.',
    result: 'Figma file + root node IDs + import status',
  },
]

const journeyData = {
  marketer: {
    label: 'Маркетолог',
    note: 'Основной пользователь',
    intro: 'Проходит путь от идеи до утверждённого production package, принимая решения в точках, где важен человеческий выбор.',
    steps: [
      ['Создать кампанию', 'Ввести свободный brief и запустить анализ.'],
      ['Проверить copy', 'Выбрать headline, body, offer и CTA; ручные правки сохраняются как версия.'],
      ['Выбрать visual', 'Сгенерировать изображения и выбрать направление, которое стоит развивать.'],
      ['Собрать banners', 'Выбрать template directions, форматы и проверить стоимость.'],
      ['Отправить на review', 'Создать immutable package и назначить дизайнера через Slack.'],
      ['Подтвердить результат', 'После Figma Ready for Development проверить snapshot и approve delivery.'],
    ],
  },
  designer: {
    label: 'Дизайнер',
    note: 'Вторичная роль',
    intro: 'Работает в Figma, а приложение и Slack дают ему контекст, назначение и понятный сигнал о готовности.',
    steps: [
      ['Получить назначение в Slack', 'Открыть campaign summary и защищённую ссылку на импорт.'],
      ['Импортировать package', 'Запустить Import Review Package и создать frames в REVIEW section.'],
      ['Проверить качество', 'Оценить copy, media, layout, brand и соответствие template contract.'],
      ['Внести изменения', 'Редактировать содержимое внутри stable root wrapper frames.'],
      ['Подготовить к разработке', 'Переместить готовые frames в READY и отметить каждый Ready for Development.'],
      ['Закрыть review', 'Webhook обновляет приложение; marketer получает сигнал для финального approval.'],
    ],
  },
}

const checklistItems = [
  { id: 'ira-wireflows', owner: 'Ira', stage: 'До implementation', title: 'Подготовить wireflows', artifact: 'User journeys + screen map', dependency: 'Утвердить golden path' },
  { id: 'ira-state-copy', owner: 'Ira', stage: 'До implementation', title: 'Зафиксировать UI state/copy matrix', artifact: 'States, copy и CTA labels', dependency: 'Brief → delivery flow' },
  { id: 'ira-edge-states', owner: 'Ira', stage: 'Parallel work', title: 'Описать loading, empty и error states', artifact: 'State acceptance notes', dependency: 'AI jobs и webhook events' },
  { id: 'ira-qa', owner: 'Ira', stage: 'Launch readiness', title: 'Провести responsive и accessibility QA', artifact: 'QA checklist + issues', dependency: 'Стабильный vertical slice' },
  { id: 'vlad-directions', owner: 'Vlad', stage: 'До implementation', title: 'Создать 3–5 template directions', artifact: 'Figma template frames', dependency: 'Утвердить visual direction' },
  { id: 'vlad-slots', owner: 'Vlad', stage: 'До implementation', title: 'Определить canonical slots и safe zones', artifact: 'Slot contract + constraints', dependency: 'Copy/content contract' },
  { id: 'vlad-library', owner: 'Vlad', stage: 'Parallel work', title: 'Собрать variables и semantic tokens', artifact: 'Figma library + token set', dependency: 'Template directions' },
  { id: 'vlad-manifest', owner: 'Vlad', stage: 'Launch readiness', title: 'Опубликовать template manifest', artifact: 'Template ID, version, checksum', dependency: 'Publish Template command' },
  { id: 'roman-state-machine', owner: 'Roman + Codex', stage: 'До implementation', title: 'Зафиксировать state machine и API contracts', artifact: 'Schema + transition rules', dependency: 'Approved product scope' },
  { id: 'roman-genai', owner: 'Roman + Codex', stage: 'Parallel work', title: 'Подключить image/video generation jobs', artifact: 'Provider adapter + job status', dependency: 'Brief and asset schema' },
  { id: 'roman-safety', owner: 'Roman + Codex', stage: 'Parallel work', title: 'Добавить safety gate для AI outputs', artifact: 'Moderation, rejection and retry rules', dependency: 'Generation pipeline' },
  { id: 'roman-renderer', owner: 'Roman + Codex', stage: 'Parallel work', title: 'Собрать renderer и export package', artifact: 'PNG / MP4 / ZIP outputs', dependency: 'Template manifest' },
  { id: 'roman-bridge', owner: 'Roman + Codex', stage: 'Launch readiness', title: 'Проверить Figma/Slack handshake', artifact: 'Plugin + webhook smoke test', dependency: 'Published template + review package' },
  { id: 'team-golden-path', owner: 'Вся команда', stage: 'До implementation', title: 'Утвердить golden path и MVP boundaries', artifact: 'Decision log', dependency: 'Роли и scope' },
  { id: 'team-pilot', owner: 'Вся команда', stage: 'Launch readiness', title: 'Провести pilot dataset и demo rehearsal', artifact: 'Pilot checklist + demo campaign', dependency: 'Рабочий vertical slice' },
  { id: 'team-go-live', owner: 'Вся команда', stage: 'Launch readiness', title: 'Принять go / no-go решение', artifact: 'Launch sign-off', dependency: 'QA, approval SLA и demo evidence' },
]

const checklistOwners = ['Все владельцы', 'Ira', 'Vlad', 'Roman + Codex', 'Вся команда']
const checklistStages = ['Все стадии', 'До implementation', 'Parallel work', 'Launch readiness']

const overallMermaid = `flowchart LR
  Marketer --> App[Lingu Studio]
  App --> Jobs[AI jobs]
  Jobs --> Assets[Images / video]
  Vlad --> Publish[Publish Template]
  Publish --> Registry[Template registry]
  Registry --> App
  App --> Package[Review package]
  Package --> Slack[Slack assignment]
  Slack --> Designer
  Designer --> Import[Import Review Package]
  Import --> Figma[Figma frames]
  Figma --> Webhook[Ready webhook]
  Webhook --> App
  App --> Delivery[Approved delivery]`

const marketerMermaid = `flowchart TD
  Brief --> Copy --> Assets --> Templates --> Review
  Review --> Figma[Figma review]
  Figma --> Ready[Ready for Development]
  Ready --> Approve[Marketer approval]
  Approve --> Delivery[PNG / MP4 / ZIP]`

const designerMermaid = `flowchart TD
  Slack[Slack assignment] --> Open[Open Figma]
  Open --> Import[Import package]
  Import --> Inspect[Inspect and edit]
  Inspect --> Ready[Move to READY]
  Ready --> Dev[Mark Ready for Development]
  Dev --> Webhook[Webhook to app]`

export function DocumentationScreen() {
  const [journey, setJourney] = useState('marketer')
  const activeJourney = journeyData[journey]

  return (
    <section className="documentation-screen">
      <header className="docs-hero" id="top">
        <div className="docs-hero__glow" aria-hidden="true" />
        <div className="docs-hero__topline">
          <p className="page-context">Рабочая документация MVP</p>
          <span className="docs-status"><CircleDot size={12} aria-hidden="true" /> Product contract / v1</span>
        </div>
        <div className="docs-hero__grid">
          <div>
            <h1 aria-label="Продукт, команда и Figma Bridge Plugin">Продукт, команда<br />и <em>Figma Bridge Plugin</em></h1>
            <p className="docs-hero__lede">Lingu Studio превращает один маркетинговый brief в reviewed banner package. AI ускоряет производство, templates удерживают качество, дизайнер сохраняет контроль.</p>
            <div className="docs-hero__actions">
              <a className="button button--primary" href="#how-it-works">Как это работает <ArrowRight size={16} aria-hidden="true" /></a>
              <a className="docs-text-link" href="#team">Кто за что отвечает <ArrowRight size={15} aria-hidden="true" /></a>
            </div>
          </div>
          <div className="docs-hero__promise">
            <div className="docs-promise-card">
              <span className="docs-promise-card__mark"><Sparkles size={16} aria-hidden="true" /></span>
              <p>Один правдивый golden path</p>
              <strong>Brief → Figma → Approval</strong>
              <span>С измеримым сокращением ручной production работы.</span>
            </div>
            <div className="docs-hero__meta-row"><span>Primary user</span><strong>Маркетолог</strong></div>
            <div className="docs-hero__meta-row"><span>Human gate</span><strong>Дизайнер в Figma</strong></div>
          </div>
        </div>
      </header>

      <nav className="docs-section-nav" aria-label="Разделы документации">
        <a href="#how-it-works">Как работает</a>
        <a href="#team">Роли команды</a>
        <a href="#mvp-scope">MVP scope</a>
        <a href="#checklist">Checklist</a>
        <a href="#templates">Templates</a>
        <a href="#figma-bridge">Figma Bridge</a>
        <a href="#journeys">Journeys</a>
      </nav>

      <div className="docs-content">
        <section className="docs-section" id="how-it-works" aria-labelledby="how-it-works-title">
          <div className="docs-section__header">
            <div><span className="docs-kicker">01 / SYSTEM LOGIC</span><h2 id="how-it-works-title">Как работает Lingu Studio</h2></div>
            <p>Приложение держит весь production workflow в поле зрения, но делает human review обязательным перед delivery.</p>
          </div>
          <div className="docs-pipeline" aria-label="Шесть этапов production workflow">
            {pipeline.map(([number, title, description], index) => (
              <div className="docs-pipeline__item" key={number}>
                <span className="docs-step-number">{number}</span>
                <strong>{title}</strong>
                <p>{description}</p>
                {index < pipeline.length - 1 && <ArrowRight className="docs-pipeline__arrow" size={16} aria-hidden="true" />}
              </div>
            ))}
          </div>
          <div className="docs-diagram-card">
            <div className="docs-diagram-card__header"><div><span className="docs-kicker">ARCHITECTURE MAP</span><h3>От контекста до готового пакета</h3></div><span className="docs-diagram-card__badge">Source of truth: app DB</span></div>
            <ArchitectureDiagram />
            <MermaidSource source={overallMermaid} />
          </div>
        </section>

        <section className="docs-section docs-section--compact" id="team" aria-labelledby="team-title">
          <div className="docs-section__header">
            <div><span className="docs-kicker">02 / OWNERSHIP</span><h2 id="team-title">Три роли, один контракт</h2></div>
            <p>Работать параллельно можно сразу после contract sprint. Каждый владелец отвечает за свою систему решений.</p>
          </div>
          <div className="docs-role-grid">
            {teamRoles.map(({ id, eyebrow, name, accent, icon: Icon, summary, outputs }) => (
              <article className={`docs-role-card ${accent}`} key={id}>
                <div className="docs-role-card__top"><span className="docs-kicker">{eyebrow}</span><Icon size={20} aria-hidden="true" /></div>
                <h3>{name}</h3>
                <p>{summary}</p>
                <ul>{outputs.map((output) => <li key={output}><Check size={14} aria-hidden="true" />{output}</li>)}</ul>
              </article>
            ))}
          </div>
        </section>

        <section className="docs-section" id="mvp-scope" aria-labelledby="mvp-scope-title">
          <div className="docs-section__header">
            <div><span className="docs-kicker">03 / BOUNDARIES</span><h2 id="mvp-scope-title">MVP делает меньше, но честно</h2></div>
            <p>Первый релиз должен доказать экономию времени, а не имитировать большую платформу.</p>
          </div>
          <div className="docs-scope-grid">
            <ScopeCard title="Что приложение делает" tone="positive" items={['Сохраняет campaign, brief и copy versions', 'Генерирует real image candidates', 'Собирает 3–5 опубликованных templates', 'Создаёт Figma review frames через plugin', 'Синхронизирует Ready for Development', 'Выдаёт реальные PNG/MP4/ZIP assets']} />
            <ScopeCard title="Что приложение не делает" tone="quiet" items={['Не заменяет дизайнера', 'Не создаёт arbitrary layouts из pixels', 'Не синхронизирует каждое изменение Figma', 'Не публикует ads автоматически', 'Не гарантирует юридическую корректность claims', 'Не включает marketplace, billing и multi-org']} />
          </div>
          <div className="docs-callout"><ShieldCheck size={20} aria-hidden="true" /><p><strong>Human gate:</strong> никакой delivery без дизайнерского review и отдельного marketer approval exact snapshot.</p></div>
        </section>

        <ChecklistSection />

        <section className="docs-section" id="templates" aria-labelledby="templates-title">
          <div className="docs-section__header">
            <div><span className="docs-kicker">05 / VISUAL SYSTEM</span><h2 id="templates-title">Что нужно подготовить для templates</h2></div>
            <p>Vlad создаёт не просто красивые banner frames, а компоненты, которые приложение может безопасно собрать и проверить.</p>
          </div>
          <div className="docs-template-layout">
            <div className="docs-template-contract">
              <div className="docs-contract-row docs-contract-row--head"><span>Canonical slot</span><span>Figma representation</span><span>Rule</span></div>
              {[
                ['headline', 'TEXT property', 'required · max chars'],
                ['body', 'TEXT property', 'required · overflow block'],
                ['offer', 'TEXT + BOOLEAN', 'optional'],
                ['cta', 'TEXT property', 'required · one line'],
                ['media', '@slot/media layer', 'required · image fill'],
              ].map(([slot, representation, rule]) => <div className="docs-contract-row" key={slot}><code>{slot}</code><span>{representation}</span><span>{rule}</span></div>)}
            </div>
            <div className="docs-template-notes">
              <div className="docs-note"><span className="docs-note__index">A</span><div><strong>3–5 directions</strong><p>Каждый direction имеет четыре visually authored ratios: square, portrait, story, landscape.</p></div></div>
              <div className="docs-note"><span className="docs-note__index">B</span><div><strong>One source of truth</strong><p>Figma variables и component properties компилируются в immutable Template Manifest.</p></div></div>
              <div className="docs-note"><span className="docs-note__index">C</span><div><strong>Publish gate</strong><p>Missing slots, fonts, clipping и invalid dimensions блокируют публикацию.</p></div></div>
            </div>
          </div>
        </section>

        <section className="docs-section" id="figma-bridge" aria-labelledby="figma-bridge-title">
          <div className="docs-section__header">
            <div><span className="docs-kicker">06 / FIGMA INTEGRATION</span><h2 id="figma-bridge-title">Figma Bridge Plugin</h2></div>
            <p>Тонкий мост между приложением и Figma. Business logic остаётся в backend, plugin выполняет проверяемые операции в документе.</p>
          </div>
          <div className="docs-plugin-grid">
            {pluginCommands.map(({ number, title, label, icon: Icon, description, result }) => (
              <article className="docs-plugin-card" key={title}>
                <div className="docs-plugin-card__top"><span className="docs-step-number">{number}</span><Icon size={19} aria-hidden="true" /></div>
                <span className="docs-plugin-card__label">{label}</span>
                <h3>{title}</h3>
                <p>{description}</p>
                <div className="docs-plugin-card__result"><Check size={14} aria-hidden="true" /><span>{result}</span></div>
              </article>
            ))}
          </div>
          <div className="docs-approval-flow">
            <div className="docs-approval-flow__intro"><span className="docs-kicker">APPROVAL HANDSHAKE</span><h3>Что происходит после отправки</h3></div>
            <div className="docs-approval-flow__steps">
              {['Package создан', 'Designer импортирует', 'Frames готовы', 'Marketer approve'].map((step, index) => <div key={step} className="docs-approval-step"><span>{String(index + 1).padStart(2, '0')}</span><strong>{step}</strong>{index < 3 && <ArrowRight size={15} aria-hidden="true" />}</div>)}
            </div>
          </div>
          <MermaidSource source={designerMermaid} label="Скопировать Mermaid source для designer journey" />
        </section>

        <section className="docs-section" id="journeys" aria-labelledby="journeys-title">
          <div className="docs-section__header">
            <div><span className="docs-kicker">07 / USER JOURNEYS</span><h2 id="journeys-title">Два взгляда на один процесс</h2></div>
            <p>Маркетолог принимает production decisions в приложении. Дизайнер работает в Figma, а приложение фиксирует результат.</p>
          </div>
          <div className="docs-journey" role="region" aria-label="User journeys">
            <div className="docs-journey__tabs" role="tablist" aria-label="Выбор user journey">
              {Object.entries(journeyData).map(([id, data]) => <button key={id} type="button" role="tab" aria-label={data.label} aria-selected={journey === id} onClick={() => setJourney(id)}>{data.label}<span>{data.note}</span></button>)}
            </div>
            <div className="docs-journey__body">
              <div className="docs-journey__intro"><span className="docs-kicker">{activeJourney.note}</span><h3>Путь: {activeJourney.label.toLowerCase()}</h3><p>{activeJourney.intro}</p></div>
              <ol className="docs-journey__steps">
                {activeJourney.steps.map(([title, description], index) => <li key={title}><span className="docs-step-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{title}</strong><p>{description}</p></div>{index === activeJourney.steps.length - 1 ? <Check className="docs-journey__done" size={17} aria-hidden="true" /> : <ChevronDown className="docs-journey__chevron" size={16} aria-hidden="true" />}</li>)}
              </ol>
            </div>
            <MermaidSource source={journey === 'marketer' ? marketerMermaid : designerMermaid} label={`Скопировать Mermaid source для journey: ${activeJourney.label}`} />
          </div>
        </section>

        <section className="docs-next" aria-labelledby="next-title">
          <div><span className="docs-kicker">NEXT CHECKPOINT</span><h2 id="next-title">Перед началом feature implementation</h2><p>Нужно утвердить C1–C6: state machine, template manifest, review package, UI state matrix, Figma handshake и русский product language.</p></div>
          <a className="button button--primary" href="#top">Вернуться к началу <ArrowRight size={16} aria-hidden="true" /></a>
        </section>
      </div>
    </section>
  )
}

function ArchitectureDiagram() {
  return (
    <div className="docs-architecture-diagram" role="img" aria-label="Общая логика Lingu Studio">
      <div className="docs-architecture-row">
        <DiagramNode label="Маркетолог" meta="brief + choices" tone="blue" />
        <DiagramConnector />
        <DiagramNode label="Lingu Studio" meta="campaign DB" tone="blue" />
        <DiagramConnector />
        <DiagramNode label="AI jobs" meta="image / video" tone="yellow" />
        <DiagramConnector />
        <DiagramNode label="Assets" meta="object storage" tone="green" />
      </div>
      <div className="docs-architecture-row docs-architecture-row--secondary">
        <DiagramNode label="Vlad" meta="visual system" tone="yellow" />
        <DiagramConnector />
        <DiagramNode label="Publish Template" meta="plugin command" tone="yellow" />
        <DiagramConnector />
        <DiagramNode label="Template registry" meta="manifest v1" tone="blue" />
        <DiagramConnector />
        <DiagramNode label="Assembler" meta="review package" tone="blue" />
      </div>
      <div className="docs-architecture-row">
        <DiagramNode label="Designer" meta="Slack + Figma" tone="green" />
        <DiagramConnector />
        <DiagramNode label="Import package" meta="root wrappers" tone="blue" />
        <DiagramConnector />
        <DiagramNode label="Ready webhook" meta="all frames ready" tone="yellow" />
        <DiagramConnector />
        <DiagramNode label="Approval → delivery" meta="PNG / MP4 / ZIP" tone="green" />
      </div>
    </div>
  )
}

function ChecklistSection() {
  const [ownerFilter, setOwnerFilter] = useState('Все владельцы')
  const [stageFilter, setStageFilter] = useState('Все стадии')
  const [completedIds, setCompletedIds] = useState(() => readChecklistProgress())

  useEffect(() => {
    window.localStorage.setItem('lingu-studio-mvp-checklist-v1', JSON.stringify([...completedIds]))
  }, [completedIds])

  const visibleItems = useMemo(() => checklistItems.filter((item) => {
    const ownerMatches = ownerFilter === 'Все владельцы' || item.owner === ownerFilter
    const stageMatches = stageFilter === 'Все стадии' || item.stage === stageFilter
    return ownerMatches && stageMatches
  }), [ownerFilter, stageFilter])
  const completedCount = checklistItems.filter((item) => completedIds.has(item.id)).length

  function toggleItem(itemId) {
    setCompletedIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  return (
    <section className="docs-section docs-checklist" id="checklist" aria-labelledby="checklist-title" role="region">
      <div className="docs-section__header">
        <div><span className="docs-kicker">04 / LAUNCH PLAN</span><h2 id="checklist-title">MVP Launch Checklist</h2></div>
        <p>Рабочий список перед запуском: что нужно закрыть до implementation, что можно делать параллельно и что доказывает готовность MVP.</p>
      </div>
      <div className="docs-checklist__summary">
        <div><span className="docs-kicker">OVERALL PROGRESS</span><strong>{completedCount} из {checklistItems.length} задач</strong><div className="docs-progress"><span style={{ width: `${(completedCount / checklistItems.length) * 100}%` }} /></div></div>
        <div className="docs-checklist__role-progress">{['Ira', 'Vlad', 'Roman + Codex', 'Вся команда'].map((owner) => <span key={owner}><b>{owner}</b>{checklistItems.filter((item) => item.owner === owner && completedIds.has(item.id)).length}/{checklistItems.filter((item) => item.owner === owner).length}</span>)}</div>
      </div>
      <div className="docs-checklist__filters" aria-label="Фильтры MVP checklist">
        <div className="docs-filter-group" aria-label="Фильтр по владельцу"><span>Владелец</span>{checklistOwners.map((owner) => <button key={owner} type="button" aria-pressed={ownerFilter === owner} onClick={() => setOwnerFilter(owner)}>{owner}</button>)}</div>
        <div className="docs-filter-group" aria-label="Фильтр по стадии"><span>Этап</span>{checklistStages.map((stage) => <button key={stage} type="button" aria-pressed={stageFilter === stage} onClick={() => setStageFilter(stage)}>{stage}</button>)}</div>
      </div>
      <div className="docs-checklist__items">
        {visibleItems.map((item) => <label className={`docs-checklist-item${completedIds.has(item.id) ? ' is-complete' : ''}`} key={item.id}>
          <input type="checkbox" aria-label={`Отметить: ${item.title}`} checked={completedIds.has(item.id)} onChange={() => toggleItem(item.id)} />
          <span className="docs-checklist-item__check"><Check size={14} aria-hidden="true" /></span>
          <span className="docs-checklist-item__body"><strong>{item.title}</strong><span><b>{item.owner}</b> · {item.stage}</span><small>Артефакт: {item.artifact} · Зависит от: {item.dependency}</small></span>
        </label>)}
      </div>
      <div className="docs-callout"><ShieldCheck size={20} aria-hidden="true" /><p><strong>Definition of ready:</strong> MVP можно показывать, когда golden path проходит end-to-end, дизайнерский review фиксируется в Figma, а финальный delivery требует explicit approval.</p></div>
    </section>
  )
}

function readChecklistProgress() {
  try {
    const stored = JSON.parse(window.localStorage.getItem('lingu-studio-mvp-checklist-v1') ?? '[]')
    return new Set(Array.isArray(stored) ? stored.filter((id) => checklistItems.some((item) => item.id === id)) : [])
  } catch {
    return new Set()
  }
}

function DiagramNode({ label, meta, tone }) {
  return <div className={`docs-diagram-node docs-diagram-node--${tone}`}><strong>{label}</strong><span>{meta}</span></div>
}

function DiagramConnector() {
  return <ArrowRight className="docs-diagram-connector" size={15} aria-hidden="true" />
}

function MermaidSource({ source, label = 'Показать Mermaid source' }) {
  return <details className="docs-details"><summary>{label}<ChevronDown size={15} aria-hidden="true" /></summary><pre>{source}</pre></details>
}

function ScopeCard({ title, tone, items }) {
  return <article className={`docs-scope-card docs-scope-card--${tone}`}><div className="docs-scope-card__title"><span>{tone === 'positive' ? 'IN' : 'OUT'}</span><h3>{title}</h3></div><ul>{items.map((item) => <li key={item}><Check size={14} aria-hidden="true" />{item}</li>)}</ul></article>
}
