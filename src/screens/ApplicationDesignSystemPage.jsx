import { ArrowLeft } from 'lucide-react'
import { DesignSystemScreen } from './DesignSystemScreen.jsx'
import '../styles/application-design-system.css'

export default function ApplicationDesignSystemPage() {
  return <div className="application-design-system">
    <header className="application-design-system__header">
      <a href="/mvp"><ArrowLeft size={16} aria-hidden="true" />Back to Banner Studio</a>
      <span>Application UI reference</span>
    </header>
    <main><DesignSystemScreen /></main>
  </div>
}
