import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  LayoutTemplate,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  RefreshCw,
  Shapes,
  X,
} from 'lucide-react'
import { createStudioApi } from './api.js'
import { useStudioAuth } from './auth.js'
import { BriefStage } from './BriefStage.jsx'
import { CampaignOverview } from './CampaignOverview.jsx'
import { CampaignTimeline } from './CampaignTimeline.jsx'
import { CopyStage } from './CopyStage.jsx'
import { VisualStage } from './VisualStage.jsx'
import { BannerStage } from './BannerStage.jsx'
import { ReviewStage } from './ReviewStage.jsx'
import { TemplateLibrary } from './TemplateLibrary.jsx'
import { BrandDesignSystems } from './BrandDesignSystems.jsx'
import { Button, ErrorNotice } from './primitives.jsx'
import {
  actionKey,
  canVisitStage,
  currentStage,
  editableStatuses,
  routeFromLocation,
  stages,
  statusLabel,
} from './workflow.js'
import './studio.css'
import './campaign-layout.css'

const readRoute = () => routeFromLocation(location.pathname, location.search)

export function StudioApp() {
  const auth = useStudioAuth()
  const api = useMemo(
    () =>
      createStudioApi({ getToken: auth.getToken, getHeaders: auth.getHeaders }),
    [auth.user, auth.demo, auth.role],
  )
  if (auth.loading)
    return (
      <div className="bs-auth" role="status">
        <span className="bs-wordmark">Banner Studio</span>
        <p>Opening your workspace…</p>
      </div>
    )
  if (!auth.user)
    return (
      <div className="bs-root bs-auth">
        <span className="bs-wordmark">
          <Shapes size={24} />
          Banner Studio
        </span>
        <h1>
          Good ideas deserve
          <br />a great campaign.
        </h1>
        <p>Sign in to create, review and deliver with your team.</p>
        {auth.error && <p role="alert">{auth.error}</p>}
        <Button primary onClick={auth.signIn}>
          Continue with Google
          <ArrowUpRight size={18} />
        </Button>
        <a href="/docs/">Read the team documentation</a>
      </div>
    )
  return (
    <ConnectedStudio
      key={`${auth.demo ? auth.role : auth.user.uid}`}
      api={api}
      demo={auth.demo}
      onRole={auth.setRole}
      onSignOut={auth.signOut}
    />
  )
}

export function ConnectedStudio({ api, demo = false, onRole, onSignOut }) {
  const [actor, setActor] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [templates, setTemplates] = useState([])
  const [workspace, setWorkspace] = useState(null)
  const [route, setRoute] = useState(readRoute)
  const [loading, setLoading] = useState(true)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState('')
  const [notice, setNotice] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [copyView, setCopyView] = useState('Table')
  const [requestedTemplate, setRequestedTemplate] = useState(null)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const inFlight = useRef(false)
  const loadId = useRef(0)
  const mainRef = useRef(null)
  const mobileRef = useRef(null)
  const cancelRef = useRef(null)
  const generationKeys = useRef(new Map())
  const [waiting, setWaiting] = useState(false)
  const markDirty = useCallback((value) => {
    dirtyRef.current = value
    setDirty(value)
  }, [])

  const loadLists = useCallback(async () => {
    const [session, campaignList, templateList] = await Promise.all([
      api.getSession(),
      api.listCampaigns(),
      api.listTemplates(),
    ])
    setActor(session)
    setCampaigns(campaignList.campaigns)
    setTemplates(templateList.templates)
  }, [api])
  useEffect(() => {
    let active = true
    loadLists()
      .catch((value) => {
        if (active) setError(value)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      cancelRef.current?.abort()
    }
  }, [loadLists])
  const loadWorkspace = useCallback(
    async (id) => {
      const ticket = ++loadId.current
      setWorkspaceLoading(true)
      try {
        const value = await api.getWorkspace(id)
        if (ticket === loadId.current) {
          setWorkspace(value)
          setCampaigns((items) =>
            items.map((item) => (item.id === id ? value.campaign : item)),
          )
        }
        return value
      } finally {
        if (ticket === loadId.current) setWorkspaceLoading(false)
      }
    },
    [api],
  )
  useEffect(() => {
    if (route.view === 'campaign' && route.id) {
      setWorkspace(null)
      setError(null)
      loadWorkspace(route.id).catch(setError)
    } else {
      ++loadId.current
      setWorkspaceLoading(false)
    }
  }, [route.view, route.id, loadWorkspace])
  useEffect(() => {
    const pop = () => {
      markDirty(false)
      setRoute(readRoute())
    }
    const unload = (event) => {
      if (dirtyRef.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('popstate', pop)
    window.addEventListener('beforeunload', unload)
    return () => {
      window.removeEventListener('popstate', pop)
      window.removeEventListener('beforeunload', unload)
    }
  }, [markDirty])
  useEffect(() => {
    if (sidebarOpen) mobileRef.current?.showModal()
    else mobileRef.current?.close()
  }, [sidebarOpen])
  useEffect(() => {
    if (!workspaceLoading) mainRef.current?.focus({ preventScroll: true })
  }, [route.view, route.id, route.step, workspaceLoading])
  function navigate(path) {
    if (inFlight.current) return
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?'))
      return
    markDirty(false)
    history.pushState({}, '', path)
    setRoute(readRoute())
    setSidebarOpen(false)
    setError(null)
    setNotice('')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function goStage(index) {
    if (workspace && canVisitStage(index, workspace))
      navigate(
        `/mvp/campaign/${encodeURIComponent(workspace.campaign.id)}?step=${index}`,
      )
  }
  function scrollToStage(index) {
    if (workspace && canVisitStage(index, workspace)) {
      document.getElementById(`campaign-step-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
  async function run(
    label,
    operation,
    { next, success = 'Changes saved' } = {},
  ) {
    if (inFlight.current) return
    inFlight.current = true
    setPending(label)
    setError(null)
    setNotice('')
    try {
      await operation()
      markDirty(false)
      const updated = workspace
        ? await loadWorkspace(workspace.campaign.id)
        : null
      await loadLists()
      setNotice(success)
      if (updated && next !== undefined) {
        const step = typeof next === 'function' ? next(updated) : next
        history.replaceState(
          {},
          '',
          `/mvp/campaign/${encodeURIComponent(updated.campaign.id)}?step=${step}`,
        )
        setRoute(readRoute())
      }
      return true
    } catch (value) {
      setError(value)
      if (label.startsWith('Generate') && workspace)
        await loadWorkspace(workspace.campaign.id).catch(() => {})
      throw value
    } finally {
      inFlight.current = false
      setPending('')
    }
  }
  const safeRun = (...args) => run(...args).catch(() => {})
  async function waitJob(response) {
    let job = response.job ?? response
    const controller = new AbortController()
    cancelRef.current = controller
    setWaiting(job.status === 'pending')
    const deadline = Date.now() + 120000
    while (
      job.status === 'pending' &&
      Date.now() < deadline &&
      !controller.signal.aborted
    ) {
      await new Promise((resolve) => setTimeout(resolve, 900))
      job = await api.getJob(job.id)
    }
    cancelRef.current = null
    setWaiting(false)
    if (job.status === 'pending') {
      throw new Error(
        'Generation is still running. Reload the campaign to check its result before starting another request.',
      )
    }
    if (job.status !== 'succeeded')
      throw new Error(
        job.status === 'unknown'
          ? 'The provider result is uncertain. Contact an administrator before generating again.'
          : `Generation ${job.status}. ${job.errorCode ?? 'Try adjusting the brief and review the workspace limits.'}`,
      )
    return job
  }
  async function generate(step, input = {}, source = workspace) {
    if (source.jobs.some((job) => ['pending', 'unknown'].includes(job.status)))
      throw new Error(
        'A generation is still pending or needs reconciliation. Reload the campaign or contact an administrator before starting another generation.',
      )
    const fingerprint = JSON.stringify([
      source.campaign.id,
      source.campaign.revision,
      step,
      input,
    ])
    const key = generationKeys.current.get(fingerprint) ?? actionKey()
    generationKeys.current.set(fingerprint, key)
    try {
      const response = await api.generate(source.campaign.id, step, input, key)
      const result = await waitJob(response)
      generationKeys.current.delete(fingerprint)
      return result
    } finally {
      setWaiting(false)
      cancelRef.current = null
    }
  }
  async function generateCopy(input) {
    let source = workspace
    if (input) {
      try {
        await run('Save brief', () =>
          api.patchCampaign(
            workspace.campaign.id,
            input,
            workspace.campaign.revision,
          ),
        )
        source = await api.getWorkspace(workspace.campaign.id)
      } catch (value) {
        setError(value)
        return
      }
    }
    return safeRun(
      'Generate copy',
      async () => {
        await generate('brief', {}, source)
        await generate('copy', {}, source)
      },
      { next: 1, success: 'Five copy options are ready' },
    )
  }
  async function create(input) {
    if (inFlight.current) return
    inFlight.current = true
    setPending('Create campaign')
    setError(null)
    try {
      const campaign = await api.createCampaign(input)
      markDirty(false)
      history.pushState(
        {},
        '',
        `/mvp/campaign/${encodeURIComponent(campaign.id)}?step=0`,
      )
      setRoute(readRoute())
      await loadLists()
      const source = await api.getWorkspace(campaign.id)
      setPending('Generate copy')
      await generate('brief', {}, source)
      await generate('copy', {}, source)
      await loadWorkspace(campaign.id)
      await loadLists()
      history.replaceState(
        {},
        '',
        `/mvp/campaign/${encodeURIComponent(campaign.id)}?step=1`,
      )
      setRoute(readRoute())
      setNotice('Five copy options are ready')
    } catch (value) {
      setError(value)
    } finally {
      inFlight.current = false
      setPending('')
    }
  }
  const visibleCampaigns = campaigns.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()),
  )
  const stage = workspace
    ? route.step !== null && canVisitStage(route.step, workspace)
      ? route.step
      : currentStage(workspace)
    : 0
  const editor = actor?.role === 'admin' || actor?.role === 'marketer'
  const generationBlocked = workspace?.jobs.some((job) =>
    ['pending', 'unknown'].includes(job.status),
  )
  const readOnly =
    !editor ||
    !editableStatuses.has(workspace?.campaign.status) ||
    generationBlocked
  const version = workspace?.versions.find(
    (item) => item.versionNumber === workspace.campaign.currentVersionNumber,
  )
  const navItems = [
    ['campaigns', 'Campaigns', MessageSquare, '/mvp'],
    ['templates', 'Templates', LayoutTemplate, '/mvp/templates'],
    ['system', 'Design system', Shapes, '/mvp/system'],
  ]
  const sidebar = (
    <>
      <button className="bs-brand" onClick={() => navigate('/mvp')}>
        <Shapes size={25} strokeWidth={1.7} aria-hidden="true" />
        <span>Banner Studio</span>
      </button>
      <Button
        className="bs-new"
        primary
        disabled={!editor || Boolean(pending)}
        onClick={() => navigate('/mvp/new')}
      >
        <Plus size={18} aria-hidden="true" />
        New campaign
      </Button>
      <nav className="bs-navigation" aria-label="Main navigation">
        {navItems.map(([view, label, Icon, path]) => (
          <a
            href={path}
            key={view}
            onClick={(event) => {
              if (!event.metaKey && !event.ctrlKey) {
                event.preventDefault()
                navigate(path)
              }
            }}
            aria-current={
              route.view === view ||
              (route.view === 'campaign' && view === 'campaigns')
                ? 'page'
                : undefined
            }
          >
            <Icon size={19} aria-hidden="true" />
            {label}
          </a>
        ))}
      </nav>
      <div className="bs-campaign-history">
        <label className="bs-search">
          <span className="sr-only">Search campaigns</span>
          <input
            type="search"
            placeholder="Search campaigns"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <p>Recent campaigns</p>
        <div>
          {visibleCampaigns.map((campaign) => (
            <a
              key={campaign.id}
              href={`/mvp/campaign/${encodeURIComponent(campaign.id)}`}
              onClick={(event) => {
                if (!event.metaKey && !event.ctrlKey) {
                  event.preventDefault()
                  navigate(event.currentTarget.getAttribute('href'))
                }
              }}
              aria-current={route.id === campaign.id ? 'page' : undefined}
              title={campaign.title}
            >
              <MessageSquare size={15} aria-hidden="true" />
              <span>{campaign.title}</span>
            </a>
          ))}
          {!visibleCampaigns.length && (
            <span className="bs-history-empty">
              {search
                ? 'No matching campaigns'
                : 'Your campaigns will appear here.'}
            </span>
          )}
        </div>
      </div>
      <footer className="bs-sidebar-footer">
        <a href="/docs/">
          <BookOpen size={16} aria-hidden="true" />
          Team documentation
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
        {actor && (
          <div className="bs-profile">
            <span className="bs-avatar" aria-hidden="true">
              {actor.displayName?.slice(0, 1) ?? 'B'}
            </span>
            <div>
              <strong>{actor.displayName}</strong>
              {demo ? (
                <label>
                  <span className="sr-only">Demo role</span>
                  <select
                    aria-label="Demo role"
                    value={actor.role}
                    disabled={Boolean(pending)}
                    onChange={(event) => {
                      if (
                        !dirtyRef.current ||
                        window.confirm('Discard your unsaved changes?')
                      )
                        onRole(event.target.value)
                    }}
                  >
                    <option value="marketer">Marketer</option>
                    <option value="designer">Designer</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              ) : (
                <small>{actor.role}</small>
              )}
            </div>
            {!demo && (
              <Button aria-label="Sign out" onClick={onSignOut}>
                <LogOut size={16} />
              </Button>
            )}
          </div>
        )}
      </footer>
    </>
  )

  return (
    <div className="bs-root">
      <a className="bs-skip" href="#studio-main">
        Skip to workspace
      </a>
      <aside className="bs-sidebar">{sidebar}</aside>
      <dialog
        className="bs-mobile-sidebar"
        ref={mobileRef}
        onCancel={() => setSidebarOpen(false)}
        onClick={(event) => {
          if (event.target === mobileRef.current) setSidebarOpen(false)
        }}
      >
        <div>
          <Button
            className="bs-mobile-close"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </Button>
          {sidebar}
        </div>
      </dialog>
      <div className="bs-main">
        <header className="bs-topbar">
          <Button
            className="bs-menu"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </Button>
          <div className="bs-breadcrumb">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <strong>
              {route.view === 'campaign'
                ? (workspace?.campaign.title ?? 'Campaign')
                : route.view === 'templates'
                  ? 'Templates'
                  : route.view === 'system'
                    ? 'Design system'
                    : 'Campaigns'}
            </strong>
            {route.view === 'campaign' && workspace && (
              <span
                className="bs-status bs-topbar-status"
                data-status={workspace.campaign.status}
                data-attention={['in_review', 'changes_requested', 'ready'].includes(workspace.campaign.status) || undefined}
              >
                {statusLabel(workspace.campaign.status)}
              </span>
            )}
          </div>
          <div className="bs-topbar-right">
            <a href="/docs/" aria-label="Help and documentation">
              <CircleHelp size={19} />
            </a>
          </div>
        </header>
        <main
          id="studio-main"
          tabIndex={-1}
          ref={mainRef}
          className="bs-content"
        >
          <ErrorNotice
            error={error}
            onRetry={() => {
              setError(null)
              route.id
                ? loadWorkspace(route.id).catch(setError)
                : loadLists().catch(setError)
            }}
          />
          {notice && (
            <div className="bs-notice" role="status">
              <Check size={16} aria-hidden="true" />
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {pending && (
            <div className="bs-pending" role="status">
              <span className="bs-spinner">
                <RefreshCw size={17} />
              </span>
              {pending}…
              {cancelRef.current && (
                <Button onClick={() => cancelRef.current?.abort()}>
                  Stop waiting
                </Button>
              )}
            </div>
          )}
          {loading || workspaceLoading ? (
            <div
              className="bs-loading"
              role="status"
              aria-label="Loading workspace"
            >
              <span />
              <span />
              <span />
            </div>
          ) : route.view === 'system' ? (
            <BrandDesignSystems />
          ) : route.view === 'templates' ? (
            <TemplateLibrary
              templates={templates}
              canChoose={editor && !pending}
              onChoose={(id) => {
                setRequestedTemplate(id)
                if (workspace?.campaign.selectedDirectionId)
                  navigate(`/mvp/campaign/${workspace.campaign.id}?step=3`)
                else navigate('/mvp/new')
              }}
            />
          ) : route.view === 'campaign' && workspace ? (
            <div className="bs-campaign-layout">
              <div className="bs-campaign-heading">
                <div>
                  <h1>{workspace.campaign.title}</h1>
                </div>
              </div>
              <CampaignTimeline workspace={workspace} stage={stage} pending={pending} onChange={scrollToStage} />
              <div
                className="bs-stage"
              >
                <section id="campaign-step-0" className="bs-long-section"><BriefStage
                    campaign={workspace.campaign}
                    api={api}
                    pending={pending}
                    readOnly={readOnly}
                    onDirty={markDirty}
                    onGenerate={generateCopy}
                  /></section>
                <section id="campaign-step-1" className="bs-long-section"><CopyStage
                  view={copyView}
                  onViewChange={setCopyView}
                    workspace={workspace}
                    api={api}
                    pending={pending}
                    readOnly={readOnly}
                    onGenerate={generateCopy}
                    onSelect={(copyId) =>
                      safeRun(
                        'Select copy',
                        () =>
                          api.selectCopy(
                            workspace.campaign.id,
                            { copyId },
                            workspace.campaign.revision,
                          ),
                        { success: 'Copy selected' },
                      )
                    }
                    onNext={() => goStage(2)}
                  /></section>
                <section id="campaign-step-2" className="bs-long-section"><VisualStage
                    workspace={workspace}
                    api={api}
                    pending={pending}
                    readOnly={readOnly}
                    onGenerate={() =>
                      safeRun(
                        'Generate directions',
                        () => generate('directions'),
                        { success: 'Visual directions are ready' },
                      )
                    }
                    onImage={(directionId) =>
                      safeRun(
                        'Generate image',
                        () =>
                          generate('image', {
                            directionId,
                            width: 1080,
                            height: 1080,
                          }),
                        { success: 'Image is ready' },
                      )
                    }
                    onSelect={(directionId) =>
                      safeRun(
                        'Select image',
                        () =>
                          api.selectDirection(
                            workspace.campaign.id,
                            { directionId },
                            workspace.campaign.revision,
                          ),
                        { success: 'Image selected' },
                      )
                    }
                    onNext={() => goStage(3)}
                  /></section>
                <section id="campaign-step-3" className="bs-long-section"><BannerStage
                    key={`${workspace.campaign.id}-${workspace.campaign.revision}`}
                    workspace={workspace}
                    templates={templates}
                    api={api}
                    pending={pending}
                    readOnly={readOnly}
                    requestedTemplate={requestedTemplate}
                    onDirty={markDirty}
                    onSave={(input) =>
                      run(
                        'Save composition',
                        () =>
                          api.saveComposition(
                            workspace.campaign.id,
                            input,
                            workspace.campaign.revision,
                          ),
                        { success: 'Composition saved' },
                      )
                    }
                    onNext={() => goStage(4)}
                  /></section>
                <section id="campaign-step-4" className="bs-long-section"><ReviewStage
                    stage={stage}
                    workspace={workspace}
                    api={api}
                    actor={actor}
                    pending={pending}
                    onVersion={() =>
                      safeRun(
                        'Create review version',
                        () =>
                          api.createVersion(
                            workspace.campaign.id,
                            {},
                            workspace.campaign.revision,
                            actionKey(),
                          ),
                        { next: 5, success: 'Version sent to design review' },
                      )
                    }
                    onReview={(action, input) =>
                      safeRun(
                        'Update review',
                        () =>
                          api.review(
                            version.id,
                            action,
                            input,
                            workspace.campaign.revision,
                            actionKey(),
                          ),
                        { next: currentStage, success: 'Review updated' },
                      )
                    }
                    onDeliver={() =>
                      safeRun(
                        'Build delivery',
                        () => api.deliver(version.id, {}, actionKey()),
                        { success: 'Package ready to download' },
                      )
                    }
                    onReopen={() =>
                      safeRun(
                        'Start new round',
                        () =>
                          api.request(
                            'POST',
                            `/api/v1/campaigns/${workspace.campaign.id}/reopen`,
                            {
                              body: {},
                              revision: workspace.campaign.revision,
                              idempotencyKey: actionKey(),
                            },
                          ),
                        { next: 0, success: 'New round opened' },
                      )
                    }
                  /></section>
                {[5, 6, 7].map((reviewStage) => <section id={`campaign-step-${reviewStage}`} className="bs-long-section bs-locked-section" key={reviewStage} aria-label={stages[reviewStage]}>
                  <h2>{stages[reviewStage]}</h2><p>Complete the previous step to unlock this section.</p>
                </section>)}
              </div>
            </div>
          ) : editor ? (
            <BriefStage
              key="new-campaign"
              api={api}
              pending={pending}
              onSave={create}
              onDirty={markDirty}
            />
          ) : (
            <section className="bs-review-queue">
              <h1>Ready for your review</h1>
              <p>
                Open a campaign to check the creative and leave a clear handoff.
              </p>
              {campaigns.filter((campaign) => campaign.status === 'in_review')
                .length === 0 && (
                <div className="bs-empty">
                  No campaigns are waiting for design review.
                </div>
              )}
              {campaigns
                .filter((campaign) => campaign.status === 'in_review')
                .map((campaign) => (
                  <Button
                    key={campaign.id}
                    onClick={() => navigate(`/mvp/campaign/${campaign.id}`)}
                  >
                    {campaign.title}
                    <ArrowUpRight size={16} />
                  </Button>
                ))}
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
