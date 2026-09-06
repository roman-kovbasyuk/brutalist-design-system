import { BannersView } from './BannersView.jsx'

export default function BannersModule({ port }) {
  return <BannersView input={port.input} inputKey={port.inputKey} assets={port.assets}
    pending={port.operation.kind === 'running' ? port.operation.actionId : ''} readOnly={!port.access.canEdit}
    onSave={port.actions.saveBatch} onPrepareReview={port.actions.prepareReview} onLoadTemplate={port.actions.loadTemplateVersion} onDirty={port.setDirty} requestedTemplate={port.requestedTemplate}
    onNext={() => port.navigate('review')} />
}
