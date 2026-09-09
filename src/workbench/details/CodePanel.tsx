import { useState } from 'react'
import { AppButton } from '../../components/design-system'

export type CodePanelProps = { source: string }

/** Source is supplied by a registry example, keeping its generated output deterministic. */
export function CodePanel({ source }: CodePanelProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  async function copy() {
    try {
      await navigator.clipboard.writeText(source)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }
  return <div className="ds-code-panel">
    <AppButton variant="secondary" size="compact" onClick={copy}>{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Retry copy' : 'Copy code'}</AppButton>
    {copyState === 'failed' && <p role="status">Could not copy code. Try again.</p>}
    <pre><code>{source}</code></pre>
  </div>
}
