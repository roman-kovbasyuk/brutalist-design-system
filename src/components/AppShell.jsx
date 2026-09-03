import { Blocks, BookOpen, LayoutDashboard, LayoutTemplate, WandSparkles } from 'lucide-react'
import { campaignHistory } from '../data/campaigns.js'

const destinations = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { id: 'campaign', label: 'Campaign', icon: WandSparkles },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate, path: '/templates' },
  { id: 'system', label: 'Design system', icon: Blocks, path: '/system' },
  { id: 'docs', label: 'Documentation', icon: BookOpen, path: '/docs/', external: true },
]

export function AppShell({ activeView, campaignId, onNavigate, children }) {
  return (
    <div className="app-shell">
      <aside className="global-rail">
        <button className="brand" type="button" aria-label="Banner Studio — open dashboard" onClick={() => onNavigate('/')}>
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>Banner Studio</span>
        </button>

        <nav className="global-nav" aria-label="Main navigation">
          {destinations.filter(({ id }) => !(activeView === 'campaign' && id === 'campaign')).map(({ id, label, icon: Icon, path, external }) => external ? (
            <a className="nav-item" href={path} key={id}>
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ) : (
            <button className="nav-item" data-active={activeView === id} aria-current={activeView === id ? 'page' : undefined} key={id} type="button" onClick={() => onNavigate(path ?? `/campaign/${campaignId}`)}>
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="campaign-list" aria-label="Campaigns">
          {campaignHistory.map((campaign) => (
            <button key={campaign.id} type="button" className="campaign-list__item" data-active={activeView === 'campaign' && campaignId === campaign.id} onClick={() => onNavigate(`/campaign/${campaign.id}`)}>
              <span><i className="campaign-status-dot" data-status={campaign.status.toLowerCase().replaceAll(' ', '-')} aria-hidden="true" />{campaign.name}</span>
            </button>
          ))}
        </div>

        <div className="rail-footer">
          <span className="status-dot" aria-hidden="true" />
          <span>Local demo</span>
          <small>Maya Chen · Marketer</small>
        </div>
      </aside>
      <main className="app-main">
        {children}
      </main>
    </div>
  )
}
