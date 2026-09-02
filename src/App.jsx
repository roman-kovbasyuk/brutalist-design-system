import { useEffect, useState } from 'react'
import { AppShell } from './components/AppShell.jsx'
import { campaignHistory } from './data/campaigns.js'
import { DashboardScreen } from './screens/DashboardScreen.jsx'
import { DesignSystemScreen } from './screens/DesignSystemScreen.jsx'
import { DesignerReviewScreen } from './screens/DesignerReviewScreen.jsx'
import { TemplatesScreen } from './screens/TemplatesScreen.jsx'
import { WorkflowScreen } from './screens/WorkflowScreen.jsx'

const defaultCampaignId = campaignHistory[0].id

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [requestedTemplate, setRequestedTemplate] = useState(null)
  const [reviewStates, setReviewStates] = useState({})
  const route = getRoute(pathname)
  const activeCampaignId = route.campaignId ?? defaultCampaignId

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  useEffect(() => {
    function syncPathname() {
      setPathname(window.location.pathname)
    }

    window.addEventListener('popstate', syncPathname)
    return () => window.removeEventListener('popstate', syncPathname)
  }, [])

  function navigate(nextPathname) {
    window.history.pushState({}, '', nextPathname)
    setPathname(nextPathname)
  }

  function chooseTemplate(templateId) {
    setRequestedTemplate({ id: templateId, requestedAt: Date.now() })
    navigate(`/campaign/${activeCampaignId}`)
  }

  function markBannersReady(campaignId) {
    setReviewStates((current) => ({ ...current, [campaignId]: 'ready-for-approval' }))
  }

  return (
    <AppShell activeView={route.view} campaignId={activeCampaignId} onNavigate={navigate}>
      <div hidden={route.view !== 'dashboard'}><DashboardScreen onOpenCampaign={(campaignId) => navigate(`/campaign/${campaignId}`)} /></div>
      <div hidden={route.view !== 'campaign'}><WorkflowScreen requestedTemplate={requestedTemplate} /></div>
      <div hidden={route.view !== 'templates'}><TemplatesScreen onChoose={chooseTemplate} /></div>
      <div hidden={route.view !== 'system'}><DesignSystemScreen /></div>
      {route.view === 'designer' && <DesignerReviewScreen campaign={getCampaign(route.campaignId)} reviewStatus={reviewStates[route.campaignId]} onMarkReady={() => markBannersReady(route.campaignId)} />}
    </AppShell>
  )
}

function getRoute(pathname) {
  const campaignMatch = pathname.match(/^\/campaign\/([^/]+)$/)
  if (campaignMatch) return { view: 'campaign', campaignId: campaignMatch[1] }

  const designerMatch = pathname.match(/^\/designer\/([^/]+)$/)
  if (designerMatch) return { view: 'designer', campaignId: designerMatch[1] }

  if (pathname === '/templates') return { view: 'templates' }
  if (pathname === '/system') return { view: 'system' }
  return { view: 'dashboard' }
}

function getCampaign(campaignId) {
  return campaignHistory.find((campaign) => campaign.id === campaignId) ?? campaignHistory[0]
}
