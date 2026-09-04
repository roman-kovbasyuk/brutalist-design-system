import { lazy, Suspense, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell.jsx'
import { campaignHistory } from './data/campaigns.js'
import { DashboardScreen } from './screens/DashboardScreen.jsx'
import { DesignSystemScreen } from './screens/DesignSystemScreen.jsx'
import { DesignerReviewScreen } from './screens/DesignerReviewScreen.jsx'
import { TemplatesScreen } from './screens/TemplatesScreen.jsx'
import { WorkflowScreen } from './screens/WorkflowScreen.jsx'

const MvpApp = lazy(() => import('./mvp/MvpApp.jsx').then((module) => ({ default: module.MvpApp })))

const defaultCampaignId = campaignHistory[0].id

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [campaignContextId, setCampaignContextId] = useState(() => getRoute(window.location.pathname).campaignId ?? defaultCampaignId)
  const [requestedTemplate, setRequestedTemplate] = useState(null)
  const route = getRoute(pathname)
  const activeCampaignId = route.campaignId ?? campaignContextId

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  useEffect(() => {
    function syncPathname() {
      const nextPathname = window.location.pathname
      const nextRoute = getRoute(nextPathname)
      if (nextRoute.campaignId) setCampaignContextId(nextRoute.campaignId)
      setPathname(nextPathname)
    }

    window.addEventListener('popstate', syncPathname)
    return () => window.removeEventListener('popstate', syncPathname)
  }, [])

  function navigate(nextPathname) {
    const nextRoute = getRoute(nextPathname)
    if (nextRoute.campaignId) setCampaignContextId(nextRoute.campaignId)
    window.history.pushState({}, '', nextPathname)
    setPathname(nextPathname)
  }

  function chooseTemplate(templateId) {
    setRequestedTemplate({ id: templateId, requestedAt: Date.now() })
    navigate(`/campaign/${activeCampaignId}`)
  }

  if (route.view === 'mvp') {
    return (
      <Suspense fallback={<div role="status">Loading Banner Studio…</div>}>
        <MvpApp />
      </Suspense>
    )
  }

  return (
    <AppShell activeView={route.view} campaignId={activeCampaignId} onNavigate={navigate}>
      <div hidden={route.view !== 'dashboard'}>
        <DashboardScreen
          onOpenCampaign={(campaignId) => navigate(`/campaign/${campaignId}`)}
          onCreateCampaign={() => navigate(`/campaign/campaign-${Date.now()}`)}
        />
      </div>
      <div hidden={route.view !== 'campaign'}><WorkflowScreen campaignId={activeCampaignId} requestedTemplate={requestedTemplate} /></div>
      <div hidden={route.view !== 'templates'}><TemplatesScreen onChoose={chooseTemplate} /></div>
      <div hidden={route.view !== 'system'}><DesignSystemScreen /></div>
      {route.view === 'designer' && <DesignerReviewScreen campaign={getCampaign(route.campaignId)} campaignId={route.campaignId} />}
    </AppShell>
  )
}

function getRoute(pathname) {
  if (pathname === '/mvp' || pathname.startsWith('/mvp/')) return { view: 'mvp' }

  const campaignMatch = pathname.match(/^\/campaign\/([^/]+)$/)
  if (campaignMatch) return { view: 'campaign', campaignId: campaignMatch[1] }

  const designerMatch = pathname.match(/^\/(?:designer|review)\/([^/]+)$/)
  if (designerMatch) return { view: 'designer', campaignId: designerMatch[1] }

  if (pathname === '/templates') return { view: 'templates' }
  if (pathname === '/system') return { view: 'system' }
  return { view: 'dashboard' }
}

function getCampaign(campaignId) {
  return campaignHistory.find((campaign) => campaign.id === campaignId) ?? campaignHistory[0]
}
