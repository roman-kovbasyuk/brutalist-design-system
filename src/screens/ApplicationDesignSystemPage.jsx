import { DesignSystemScreen } from './DesignSystemScreen.jsx'
import { DesignSystemRoot } from '../components/design-system/basics/DesignSystemRoot'
import { migrateCatalogRoute } from './catalog-route.js'
import '../styles/application-design-system.css'
import '../components/design-system/styles.css'

export default function ApplicationDesignSystemPage() {
  const migrated = migrateCatalogRoute(new URL(window.location.href))
  if (migrated) window.history.replaceState(window.history.state, '', migrated)
  return <DesignSystemRoot className="application-design-system">
    <main><DesignSystemScreen overviewOnRoot /></main>
  </DesignSystemRoot>
}
