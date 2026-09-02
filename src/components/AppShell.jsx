import { Blocks, LayoutDashboard, LayoutTemplate, WandSparkles } from 'lucide-react'

const destinations = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { id: 'campaign', label: 'Campaign', icon: WandSparkles },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate, path: '/templates' },
  { id: 'system', label: 'Design system', icon: Blocks, path: '/system' },
]

export function AppShell({ activeView, campaignId, onNavigate, children }) {
  return (
    <div className="app-shell">
      <aside className="global-rail">
        <button className="brand" type="button" aria-label="Lingu Studio — open dashboard" onClick={() => onNavigate('/')}>
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>Lingu Studio</span>
        </button>

        <nav className="global-nav" aria-label="Main navigation">
          {destinations.map(({ id, label, icon: Icon, path }) => (
            <button
              className="nav-item"
              data-active={activeView === id}
              aria-current={activeView === id ? 'page' : undefined}
              key={id}
              type="button"
              onClick={() => onNavigate(path ?? `/campaign/${campaignId}`)}
            >
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="rail-footer">
          <span className="status-dot" aria-hidden="true" />
          <span>Local demo</span>
          <small>Maya Chen · Marketer</small>
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  )
}
