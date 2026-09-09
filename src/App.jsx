import { lazy, Suspense } from 'react'

const ApplicationDesignSystemPage = lazy(() => import('./screens/ApplicationDesignSystemPage.jsx'))

export default function App() {
  return <Suspense fallback={<p role="status">Loading application design system…</p>}>
    <ApplicationDesignSystemPage />
  </Suspense>
}
