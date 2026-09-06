import { CopyView } from './campaign/modules/copy/CopyView.jsx'

// Compatibility adapter while the remaining campaign stages migrate. The old
// shell still owns its analysis sequence; CopyView never starts it on mount.
export function CopyStage({ workspace, api, pending, readOnly, onGenerate, onSelect, onApprove,
  onDelete, onNext }) {
  const direction = workspace.directions?.find(item => item.id === workspace.campaign.selectedDirectionId)
  return <CopyView
    input={{ copies: workspace.copies, selectedCopyId: workspace.campaign.selectedCopyId,
      previewAssetId: direction?.previewAssetId ?? null }}
    access={{ canVisit: true, canEdit: !readOnly }}
    operation={{ kind: pending ? 'running' : 'idle',
      actionId: pending === 'Generate copy' ? 'generate' : pending, error: null }}
    actions={{ generate: onGenerate, approve: onApprove ?? onSelect, remove: onDelete }}
    assets={api} onNext={onNext} nextLabel="Continue to AI assets"
  />
}
