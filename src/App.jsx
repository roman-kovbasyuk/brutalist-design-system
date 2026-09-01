import { useEffect, useState } from 'react'
import { AppShell } from './components/AppShell.jsx'
import { DesignSystemScreen } from './screens/DesignSystemScreen.jsx'
import { TemplatesScreen } from './screens/TemplatesScreen.jsx'
import { WorkflowScreen } from './screens/WorkflowScreen.jsx'

export default function App() {
  const [view, setView] = useState('workflow')
  const [requestedTemplate, setRequestedTemplate] = useState(null)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [view])

  function chooseTemplate(templateId) {
    setRequestedTemplate({ id: templateId, requestedAt: Date.now() })
    setView('workflow')
  }

  return (
    <AppShell activeView={view} onNavigate={setView}>
      <div hidden={view !== 'workflow'}><WorkflowScreen requestedTemplate={requestedTemplate} /></div>
      <div hidden={view !== 'templates'}><TemplatesScreen onChoose={chooseTemplate} /></div>
      <div hidden={view !== 'system'}><DesignSystemScreen /></div>
    </AppShell>
  )
}
