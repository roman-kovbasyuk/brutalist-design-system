import { lazy, Suspense } from 'react'
import { StudioApp } from './studio/StudioApp.jsx'

const ApplicationDesignSystemPage = lazy(() => import('./screens/ApplicationDesignSystemPage.jsx'))
const DevModulePlayground = import.meta.env.DEV
  ? lazy(() => import('./studio/campaign/testing/ModulePlayground.jsx'))
  : null

export default function App() {
  if (import.meta.env.DEV && DevModulePlayground && /^\/mvp\/dev\/modules(?:\/[^/]+)?\/?$/.test(location.pathname)) {
    return <Suspense fallback={<p role="status">Loading fixture module playground…</p>}><DevModulePlayground /></Suspense>
  }
  if (/^\/design-system\/?$/.test(location.pathname)) {
    return <Suspense fallback={<p role="status">Loading application design system…</p>}>
      <ApplicationDesignSystemPage />
    </Suspense>
  }
  return <StudioApp />
}
