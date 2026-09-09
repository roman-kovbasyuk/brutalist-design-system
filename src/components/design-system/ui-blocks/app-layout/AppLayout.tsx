import type { ReactNode } from 'react'

export type AppLayoutProps = {
  navigation: ReactNode
  header: ReactNode
  children: ReactNode
  inspector?: ReactNode
  feedback?: ReactNode
  className?: string
}

/** A product-neutral application frame composed from caller-owned slots. */
export function AppLayout({ navigation, header, children, inspector, feedback, className = '' }: AppLayoutProps) {
  return <div className={`ds-app-layout ${className}`.trim()}>
    <aside className="ds-app-layout__navigation" aria-label="Application navigation">{navigation}</aside>
    <div className="ds-app-layout__main">
      <header className="ds-app-layout__header">{header}</header>
      <main className="ds-app-layout__content">{children}</main>
    </div>
    {inspector && <aside className="ds-app-layout__inspector" aria-label="Inspector">{inspector}</aside>}
    {feedback && <div className="ds-app-layout__feedback">{feedback}</div>}
  </div>
}
