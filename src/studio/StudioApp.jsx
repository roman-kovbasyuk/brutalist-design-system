import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  LayoutTemplate,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shapes,
  Copy,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { createStudioApi } from './api.js'
import { useStudioAuth } from './auth.js'
import { BriefStage } from './BriefStage.jsx'
import { UpdatedText, useTextUpdate } from '../components/design-system/atoms/UpdatedText.jsx'
import { CampaignPage } from './campaign/CampaignPage.jsx'
import { useCampaignRuntime } from './campaign/useCampaignRuntime.js'
import { campaignModuleUrl, parseCampaignModule } from './campaign/campaignRoutes.js'
import { BrandDesignSystems } from './BrandDesignSystems.jsx'
import { Button, ErrorNotice } from './primitives.jsx'
import {
  editableStatuses,
  routeFromLocation,
  statusLabel,
} from './workflow.js'
import './studio.css'
import './campaign-layout.css'

const TemplateLibrary = lazy(() => import('./TemplateLibrary.jsx')
  .then(module => ({ default: module.TemplateLibrary })))

const readRoute = () => ({ ...routeFromLocation(location.pathname, location.search),
  module: parseCampaignModule(location.search, location.hash) })

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
  const titleUpdated = useTextUpdate(workspace?.campaign.title, workspace?.campaign.id)
  const [route, setRoute] = useState(readRoute)
  const [loading, setLoading] = useState(true)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState('')
  const [notice, setNotice] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [pinnedIds, setPinnedIds] = useState([])
  const [openCampaignMenu, setOpenCampaignMenu] = useState(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const titleRef = useRef(null)
  const titleDraft = useRef('')
  const [requestedTemplate, setRequestedTemplate] = useState(null)
  const dirtyRef = useRef(false)
  const inFlight = useRef(false)
  const loadId = useRef(0)
  const mainRef = useRef(null)
  const mobileRef = useRef(null)
  const analyzeOnOpen = useRef(null)
  const runtime = useCampaignRuntime({ api, actor, templates,
    workspace: route.view === 'campaign' && workspace?.campaign.id === route.id ? workspace : null,
    onCampaignChange: campaign => {
      setWorkspace(current => current?.campaign.id === campaign.id ? { ...current, campaign } : current)
      setCampaigns(items => items.map(item => item.id === campaign.id ? campaign : item))
    }, onError: setError })
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const acceptedLocation = useRef({ route, url: location.pathname + location.search + location.hash })
  useEffect(() => { acceptedLocation.current = { route, url: location.pathname + location.search + location.hash } }, [route])
  const hasUnsavedChanges = () => dirtyRef.current || runtimeRef.current?.hasDirty()
  const campaignBusy = () => inFlight.current || runtimeRef.current?.isBusy()
  const markDirty = useCallback((value) => {
    dirtyRef.current = value
  }, [])
  useEffect(() => {
    if (!actor?.id) return
    try {
      const saved = JSON.parse(localStorage.getItem(`studio:pins:${actor.id}`) ?? '[]')
      setPinnedIds(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [])
    } catch {
      setPinnedIds([])
    }
  }, [actor?.id])
  function togglePin(id) {
    const next = pinnedIds.includes(id) ? pinnedIds.filter((value) => value !== id) : [id, ...pinnedIds]
    setPinnedIds(next)
    setOpenCampaignMenu(null)
    try {
      localStorage.setItem(`studio:pins:${actor.id}`, JSON.stringify(next))
    } catch { /* Pins still work for this session when browser storage is unavailable. */ }
  }
  const focusSearchInput = useCallback(() => {
    requestAnimationFrame(() => {
      document.querySelector('.bs-sidebar .bs-search input, .bs-mobile-sidebar[open] .bs-search input')?.focus()
    })
  }, [])
  useEffect(() => {
    if (!editingTitle || !titleRef.current) return
    titleRef.current.focus()
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(titleRef.current)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [editingTitle])

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
      const next = readRoute()
      const previous = acceptedLocation.current
      const sameCampaign = next.view === 'campaign' && previous.route.view === 'campaign' && next.id === previous.route.id
      if (!sameCampaign) {
        if (inFlight.current || runtimeRef.current?.isBusy() ||
          ((dirtyRef.current || runtimeRef.current?.hasDirty()) && !window.confirm('Discard your unsaved changes?'))) {
          history.pushState({}, '', previous.url)
          return
        }
        markDirty(false)
      }
      setRoute(next)
    }
    const unload = (event) => {
      if (dirtyRef.current || runtimeRef.current?.hasDirty()) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('popstate', pop)
    window.addEventListener('hashchange', pop)
    window.addEventListener('beforeunload', unload)
    return () => {
      window.removeEventListener('popstate', pop)
      window.removeEventListener('hashchange', pop)
      window.removeEventListener('beforeunload', unload)
    }
  }, [markDirty])
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        focusSearchInput()
      }
      if (event.key === 'Escape') {
        setOpenCampaignMenu(null)
        setUserMenuOpen(false)
        if (searchOpen) {
          setSearchOpen(false)
          setSearch('')
        }
      }
    }
    const onPointerDown = (event) => {
      if (!event.target.closest?.('.bs-campaign-item')) setOpenCampaignMenu(null)
      if (!event.target.closest?.('.bs-profile-shell')) setUserMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [focusSearchInput, searchOpen])
  useEffect(() => {
    if (sidebarOpen) mobileRef.current?.showModal()
    else mobileRef.current?.close()
  }, [sidebarOpen])
  useEffect(() => {
    if (!workspaceLoading) mainRef.current?.focus({ preventScroll: true })
  }, [route.view, route.id, workspaceLoading])
  function navigate(path) {
    if (campaignBusy()) return
    const target = new URL(path, location.origin)
    const next = routeFromLocation(target.pathname, target.search)
    if (route.view === 'campaign' && next.view === 'campaign' && route.id === next.id) {
      history.pushState({}, '', path)
      setRoute(readRoute())
      setSidebarOpen(false)
      return
    }
    if (hasUnsavedChanges() && !window.confirm('Discard your unsaved changes?')) return
    markDirty(false)
    history.pushState({}, '', path)
    setRoute(readRoute())
    setSidebarOpen(false)
    setError(null)
    setNotice('')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function goModule(id) {
    const current = runtimeRef.current
    if (!current?.getSnapshot(id).access.canVisit || !route.id) return
    history.pushState({}, '', campaignModuleUrl(route.id, id))
    setRoute(readRoute())
    document.getElementById(`campaign-module-${id}`)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  }
  async function create(input) {
    if (campaignBusy()) return
    inFlight.current = true
    setPending('Create campaign')
    setError(null)
    try {
      const campaign = await api.createCampaign(input)
      markDirty(false)
      analyzeOnOpen.current = campaign.id
      setCampaigns(items => [campaign, ...items.filter(item => item.id !== campaign.id)])
      history.pushState({}, '', campaignModuleUrl(campaign.id, 'brief'))
      setRoute(readRoute())
      return { ok: true }
    } catch (failure) {
      const uncertain = failure.status === undefined || failure.status === 0 || failure.status >= 500
      const value = uncertain ? new Error('Creation may have completed. Check the campaign list before creating another campaign.') : failure
      setError(value)
      if (uncertain) await loadLists().catch(() => {})
      return { ok: false, message: value.message }
    } finally {
      inFlight.current = false
      setPending('')
    }
  }
  async function duplicateCampaign(campaign) {
    if (!editor || campaignBusy()) return
    if (hasUnsavedChanges() && !window.confirm('Discard your unsaved changes?')) return
    inFlight.current = true
    setOpenCampaignMenu(null)
    setPending('Duplicate campaign')
    setError(null)
    try {
      const duplicated = await api.duplicateCampaign(campaign.id)
      await loadLists()
      markDirty(false)
      history.pushState({}, '', `/mvp/campaign/${encodeURIComponent(duplicated.id)}?step=0`)
      setRoute(readRoute())
      setWorkspace(null)
      setNotice('Campaign duplicated as a new draft')
    } catch (value) {
      setError(value)
    } finally {
      inFlight.current = false
      setPending('')
    }
  }
  async function deleteCampaign(campaign) {
    if (!editor || campaignBusy()) return
    if (!window.confirm(`Remove “${campaign.title}” from active campaigns? Its files and history will be retained.`)) return
    inFlight.current = true
    setOpenCampaignMenu(null)
    setPending('Remove campaign')
    setError(null)
    try {
      await api.deleteCampaign(campaign.id, campaign.revision)
      await loadLists()
      markDirty(false)
      if (route.id === campaign.id) {
        history.pushState({}, '', '/mvp')
        setRoute(readRoute())
        setWorkspace(null)
      }
      setNotice('Campaign removed from active campaigns')
    } catch (value) {
      setError(value)
    } finally {
      inFlight.current = false
      setPending('')
    }
  }
  async function saveCampaignTitle() {
    const title = titleDraft.current.trim()
    const current = workspace?.campaign
    setEditingTitle(false)
    if (!current || !title || title === current.title) {
      if (titleRef.current && current) titleRef.current.textContent = current.title
      return
    }
    const result = await runtimeRef.current?.execute('brief', 'rename', async ({ api, workspace: source }) => {
      await api.patchCampaign(source.campaign.id, { title }, source.campaign.revision)
    }, { intent: { title }, reconcile: ({ current: refreshed }) => refreshed.campaign.title === title ? 'applied' : 'unknown' })
    if (result?.ok === false) setError(result)

  }
  const visibleCampaigns = campaigns.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()),
  )
  const editor = actor?.role === 'admin' || actor?.role === 'marketer'
  const generationBlocked = workspace?.jobs.some((job) =>
    ['pending', 'unknown'].includes(job.status),
  )
  const readOnly =
    !editor ||
    !editableStatuses.has(workspace?.campaign.status) ||
    generationBlocked
  const navItems = [
    ['campaigns', 'Campaigns', MessageSquare, '/mvp'],
    ['templates', 'Templates', LayoutTemplate, '/mvp/templates'],
    ['system', 'Design system', Shapes, '/mvp/system'],
  ]
  const sidebar = (
    <>
      <div className="bs-brand-row">
        <button className="bs-brand" onClick={() => navigate('/mvp')}>
          <Shapes size={25} strokeWidth={1.7} aria-hidden="true" />
          <span>Studio</span>
        </button>
        <button
          className="bs-search-trigger"
          type="button"
          aria-label="Search campaigns"
          aria-expanded={searchOpen}
          onClick={() => {
            setSearchOpen(true)
            focusSearchInput()
          }}
        >
          <Search size={18} aria-hidden="true" />
        </button>
      </div>
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
        {searchOpen && (
          <div className="bs-search">
            <Search size={16} aria-hidden="true" />
            <label>
              <span className="sr-only">Search campaigns</span>
              <input
                type="search"
                placeholder="Search campaigns"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              aria-label="Close search"
              onClick={() => {
                setSearchOpen(false)
                setSearch('')
              }}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="bs-project-groups">
          {[
            ['Pinned projects', pinnedIds.map((id) => visibleCampaigns.find((campaign) => campaign.id === id)).filter(Boolean)],
            ['Recent projects', visibleCampaigns.filter((campaign) => !pinnedIds.includes(campaign.id))],
          ].filter(([label, projects]) => label !== 'Pinned projects' || projects.length > 0).map(([label, projects]) => (
          <section className="bs-project-group" aria-label={label} key={label}>
            <p>{label}</p>
          {projects.map((campaign) => (
            <div className="bs-campaign-item" key={campaign.id}>
              <a
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
                <UpdatedText value={campaign.title} identity={campaign.id} />
              </a>
              <button
                type="button"
                className="bs-campaign-actions"
                aria-label={`${pinnedIds.includes(campaign.id) ? 'Unpin' : 'Pin'} ${campaign.title}`}
                aria-pressed={pinnedIds.includes(campaign.id)}
                onClick={() => togglePin(campaign.id)}
              >
                {pinnedIds.includes(campaign.id) ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="bs-campaign-actions"
                aria-label={`Actions for ${campaign.title}`}
                aria-expanded={openCampaignMenu === campaign.id}
                onClick={() => setOpenCampaignMenu((value) => value === campaign.id ? null : campaign.id)}
              >
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
              {openCampaignMenu === campaign.id && (
                <div className="bs-campaign-menu" role="menu" aria-label={`Actions for ${campaign.title}`}>
                  <button type="button" role="menuitem" disabled={!editor} onClick={() => duplicateCampaign(campaign)}>
                    <Copy size={15} aria-hidden="true" />
                    Duplicate
                  </button>
                  <button type="button" role="menuitem" disabled={!editor} onClick={() => deleteCampaign(campaign)}>
                    <Trash2 size={15} aria-hidden="true" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
          {!projects.length && !search && <span className="bs-history-empty">No recent projects.</span>}
          </section>
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
        {actor && (
          <div className="bs-profile-shell">
            <button
              type="button"
              className="bs-profile"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((value) => !value)}
            >
              <span className="bs-avatar" aria-hidden="true">
                {actor.displayName?.slice(0, 1) ?? 'B'}
              </span>
              <span className={`bs-profile-copy${demo ? ' is-demo' : ''}`}>
                <strong>{actor.displayName}</strong>
                <small>{actor.role}</small>
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {demo && (
              <label className="bs-profile-role">
                <span className="sr-only">Demo role</span>
                <select
                  aria-label="Demo role"
                  value={actor.role}
                  disabled={Boolean(pending)}
                  onChange={(event) => {
                    if (campaignBusy()) return
                    if (
                      !hasUnsavedChanges() ||
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
            )}
            {userMenuOpen && (
              <div className="bs-user-menu" role="menu" aria-label="User menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!editor}
                  onClick={() => {
                    setUserMenuOpen(false)
                    navigate('/mvp/new')
                  }}
                >
                  <Plus size={17} aria-hidden="true" />
                  New campaign
                </button>
                <hr />
                <button type="button" role="menuitem" disabled>
                  <Settings size={17} aria-hidden="true" />
                  Settings
                </button>
                <button type="button" role="menuitem" disabled>
                  <Users size={17} aria-hidden="true" />
                  Teams
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (campaignBusy() || (hasUnsavedChanges() && !window.confirm('Discard your unsaved changes?'))) return
                    setUserMenuOpen(false)
                    onSignOut?.()
                  }}
                >
                  <LogOut size={17} aria-hidden="true" />
                  Sign out
                </button>
              </div>
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
          className={`bs-content${route.view === 'new' ? ' bs-content--new' : ''}`}
        >
          <ErrorNotice
            error={error}
            onRetry={() => {
              setError(null)
              route.id
                ? (runtimeRef.current ? runtimeRef.current.refresh().catch(setError) : loadWorkspace(route.id).catch(setError))
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
            </div>
          )}
          {loading || workspaceLoading || (route.view === 'campaign' && workspace && !runtime) ? (
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
            <Suspense fallback={<div className="bs-loading" role="status" aria-label="Loading templates"><span /><span /><span /></div>}>
              <TemplateLibrary
                templates={templates}
                canChoose={editor && !pending}
                onChoose={(id) => {
                  setRequestedTemplate(id)
                  if (workspace?.campaign.selectedDirectionId)
                    navigate(campaignModuleUrl(workspace.campaign.id, 'banners'))
                  else navigate('/mvp/new')
                }}
              />
            </Suspense>
          ) : route.view === 'campaign' && workspace ? (
            <CampaignPage key={workspace.campaign.id} runtime={runtime} activeModule={route.module}
              onNavigate={goModule} requestedTemplate={requestedTemplate}
              analyzeOnOpen={analyzeOnOpen.current === workspace.campaign.id}
              onAnalysisStarted={() => { analyzeOnOpen.current = null }}
              heading={<h1
                    className="v2-updated-text"
                    data-updated={titleUpdated || undefined}
                    ref={titleRef}
                    contentEditable={editingTitle}
                    suppressContentEditableWarning
                    onClick={() => {
                      if (!editor || readOnly || pending) return
                      titleDraft.current = workspace.campaign.title
                      setEditingTitle(true)
                    }}
                    onInput={(event) => { titleDraft.current = event.currentTarget.textContent ?? '' }}
                    onBlur={saveCampaignTitle}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        event.currentTarget.blur()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        titleDraft.current = workspace.campaign.title
                        event.currentTarget.textContent = workspace.campaign.title
                        setEditingTitle(false)
                        event.currentTarget.blur()
                      }
                    }}
                    data-editable={editor && !readOnly ? 'true' : undefined}
                  >
                    {workspace.campaign.title}
                  </h1>} />
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
