import { useState } from 'react'
import { CheckCircle2, Download } from 'lucide-react'
import { AppButton } from '../../../../components/design-system/atoms/AppButton.jsx'
import { ErrorNotice, saveBlob } from '../../../primitives.jsx'

export function DistributeView({ input = {}, access = {}, operation = {}, actions = {}, expectedInputKey }) {
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(null)
  const pending = operation.kind === 'running'
  async function download() {
    setDownloading(true); setDownloadError(null)
    try { saveBlob(await actions.download(), `banner-studio-v${input.version.versionNumber}.zip`) }
    catch (error) { setDownloadError(error) }
    finally { setDownloading(false) }
  }
  if (!input.version) return <section aria-label="Distribute module"><p className="bs-note">The approved current version is unavailable.</p></section>
  return <section aria-label="Distribute module" aria-busy={pending || undefined}>
    <ErrorNotice error={operation.error ?? downloadError} />
    <div className="bs-review-summary"><div><span className="bs-tag">Version {input.version.versionNumber}</span><h3>{input.delivery ? 'Ready to download' : 'Approved and ready to export'}</h3></div></div>
    <div className="bs-delivery"><CheckCircle2 size={32} aria-hidden="true"/><div><p>The package contains the approved PNG banners and a manifest identifying the exact files.</p>
      {!access.canEdit ? <p className="bs-note">A permitted editor manages delivery packages.</p>
        : input.delivery ? <AppButton variant="primary" disabled={downloading || pending} busy={downloading} onClick={download}><Download size={17} aria-hidden="true"/>Download package</AppButton>
          : <AppButton variant="primary" disabled={pending} busy={pending && operation.actionId === 'build'} onClick={() => actions.build?.({ expectedInputKey })}>Build delivery</AppButton>}
    </div></div>
  </section>
}
