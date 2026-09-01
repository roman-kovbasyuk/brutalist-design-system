import { Blocks, LayoutTemplate, WandSparkles } from 'lucide-react'

const destinations = [
  { id: 'workflow', label: 'Процесс', icon: WandSparkles },
  { id: 'templates', label: 'Шаблоны', icon: LayoutTemplate },
  { id: 'system', label: 'Дизайн-система', icon: Blocks },
]

export function AppShell({ activeView, onNavigate, children }) {
  return (
    <div className="app-shell">
      <aside className="global-rail">
        <button className="brand" type="button" aria-label="Lingu Studio — открыть процесс" onClick={() => onNavigate('workflow')}>
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>Lingu Studio</span>
        </button>

        <nav className="global-nav" aria-label="Основная навигация">
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
          <small>Без API-ключей</small>
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  )
}
