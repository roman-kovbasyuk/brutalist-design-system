import { DesignSystemScreen } from './DesignSystemScreen.jsx'
import { DesignSystemWorkbench } from '../workbench/DesignSystemWorkbench'
import { sitePath } from './site-path.js'
import '../styles/application-design-system.css'
import '../components/design-system/styles.css'

export default function ApplicationDesignSystemPage() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('mode') === 'workbench' && params.get('section') !== 'basics') return <DesignSystemWorkbench />
  return <div className="application-design-system">
    <header className="application-design-system__header">
      <span>Reference library</span>
      <a href={sitePath('/design-system?mode=workbench')}>Open v2 workbench</a>
    </header>
    <main><DesignSystemScreen overviewOnRoot /></main>
  </div>
}
