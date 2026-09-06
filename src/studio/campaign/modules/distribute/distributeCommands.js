import { getCurrentVersion } from '../../moduleContracts.js'

const error = (code, message, status = 409) => Object.assign(new Error(message), { code, status })

function currentVersion(workspace, status) {
  if (workspace.campaign.status !== status) throw error('distribution_phase_changed', 'The approved delivery state changed. Reload before continuing.')
  const version = getCurrentVersion(workspace)
  if (!version) throw error('version_not_current', 'The approved current version is unavailable.')
  return version
}

function matchingDelivery(delivery, workspace, version) {
  return delivery && delivery.campaignId === workspace.campaign.id && delivery.versionId === version.id
    && delivery.contentHash === version.contentHash && delivery.asset?.kind === 'delivery_zip' && delivery.asset.id
}

export function createDistributeCommands(runtime) {
  const expected = options => options?.expectedInputKey ?? runtime.getSnapshot('distribute').inputKey
  return Object.freeze({
    build: (options = {}) => runtime.execute('distribute', 'build', async ({ api, workspace, idempotencyKey }) => {
      const version = currentVersion(workspace, 'approved')
      if (workspace.delivery) throw error('delivery_already_exists', 'This approved version already has a delivery package.')
      await api.deliver(version.id, {}, idempotencyKey)
    }, { expectedInputKey: expected(options), idempotent: true }),
    async download() {
      const snapshot = runtime.getSnapshot('distribute')
      if (!snapshot.access.canEdit) throw error('not_allowed', snapshot.access.reason, 403)
      return runtime.read(async ({ api, workspace, signal }) => {
        const version = currentVersion(workspace, 'delivered')
        if (!matchingDelivery(workspace.delivery, workspace, version)) {
          throw error('delivery_version_mismatch', 'The delivery package does not match the approved current version.')
        }
        const delivery = await api.getDelivery(version.id, { signal })
        if (!matchingDelivery(delivery, workspace, version) || delivery.id !== workspace.delivery.id
          || delivery.asset.id !== workspace.delivery.asset.id || delivery.asset.sha256 !== workspace.delivery.asset.sha256) {
          throw error('delivery_version_mismatch', 'The delivery package does not match the approved current version.')
        }
        return api.getAssetBlob(delivery.asset.id, { signal })
      })
    },
  })
}
