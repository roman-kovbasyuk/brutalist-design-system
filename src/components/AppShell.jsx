import { Blocks, LayoutTemplate, WandSparkles } from 'lucide-react'

const destinations = [
  { id: 'workflow', label: 'Process', icon: WandSparkles },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'system', label: 'Design system', icon: Blocks },
]

export function AppShell({ activeView, onNavigate, children }) {
  return (
    <div className="app-shell">
      <aside className="global-rail">
        <button className="brand" type="button" aria-label="Lingu Studio — open process" onClick={() => onNavigate('workflow')}>
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>Lingu Studio</span>
        </button>

        <nav className="global-nav" aria-label="Main navigation">
          {destinations.map(({ id, label, icon: Icon }) => (
            <button
              className="nav-item"
              data-active={activeView === id}
              aria-current={activeView === id ? 'page' : undefined}
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
            >
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="rail-footer">
          <span className="status-dot" aria-hidden="true" />
          <span>Local demo</span>
          <small>No API keys</small>
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  )
}
