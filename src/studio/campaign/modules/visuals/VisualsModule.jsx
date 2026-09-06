import { useRef, useState } from 'react'
import { VisualsView } from './VisualsView.jsx'
import { AppButton } from '../../../../components/design-system/atoms/AppButton.jsx'
import { AsyncStatus } from '../../../../components/design-system/molecules/AsyncStatus.jsx'
import { ErrorNotice } from '../../../primitives.jsx'

function operationFeedback(input, operation) {
  if (!operation.error) return null
  const actionId = operation.actionId ?? ''
  if (actionId === 'prepare-prompts') return { kind: 'prompt', error: operation.error }
  if (actionId.startsWith('image:')) {
    const id = actionId.slice(6)
    return input.directions.some(direction => direction.id === id)
      ? { kind: 'image', target: { directionId: id }, error: operation.error }
      : { kind: 'general', error: operation.error }
  }
  if (actionId.startsWith('upload:')) {
    const id = actionId.slice(7)
    const direction = input.directions.find(item => item.id === id)
    if (direction) return { kind: 'upload', target: { directionId: id }, error: operation.error }
    if (input.analysis || input.copies?.length) return { kind: 'upload', target: id === 'campaign'
      ? { mode: 'campaign' } : { mode: 'selected_copy', copyId: id }, error: operation.error }
  }
  return { kind: 'general', error: operation.error }
}

export default function VisualsModule({ port }) {
  const [progress, setProgress] = useState(null)
  const [transientFeedback, setTransientFeedback] = useState(null)
  const attemptId = useRef(0)
  const feedback = port.operation.kind === 'running' ? null
    : transientFeedback ?? operationFeedback(port.input, port.operation)

  async function attempt(owner, action, ...args) {
    const id = ++attemptId.current
    setTransientFeedback(null)
    try {
      const result = await action?.(...args)
      if (id === attemptId.current && result?.ok === false) setTransientFeedback({ ...owner, error: result })
      return result
    } catch (error) {
      if (id === attemptId.current) setTransientFeedback({ ...owner, error })
      return { ok: false, message: error.message || 'The operation failed. Please try again.' }
    }
  }

  async function reconcile() {
    const id = ++attemptId.current
    try {
      await port.reconcile?.()
      if (id === attemptId.current) setTransientFeedback(null)
    } catch (error) {
      if (id === attemptId.current) setTransientFeedback({ kind: 'general', error })
    }
  }

  return <>
    {feedback?.kind === 'prompt' && <div>
      <p role="alert">{feedback.error.message}</p>
      <AppButton onClick={() => attempt({ kind: 'prompt' }, port.actions.preparePrompts, { retry: true })} disabled={!port.access.canEdit || port.operation.kind === 'running'}>Retry prompt request</AppButton>
    </div>}
    {feedback?.kind === 'general' && <ErrorNotice error={feedback.error} />}
    {feedback && <AppButton onClick={reconcile}>Check latest state</AppButton>}
    {port.operation.kind === 'running' && !progress && <AsyncStatus>Working on visuals…</AsyncStatus>}
    <VisualsView input={port.input} assets={port.assets} readOnly={!port.access.canEdit}
    progress={progress}
    feedback={feedback}
    pending={port.operation.kind === 'running' ? port.operation.actionId : ''}
    onClearFeedback={() => { attemptId.current += 1; setTransientFeedback(null) }}
    onGenerate={mode => attempt({ kind: 'general' }, port.actions.generate, mode, { onProgress: setProgress })}
    onGenerateAll={() => attempt({ kind: 'general' }, port.actions.generateAll, { onProgress: setProgress })}
    onUpload={(target, file) => attempt({ kind: 'upload', target }, port.actions.upload, target, file)}
    onImage={directionId => attempt({ kind: 'image', target: { directionId } }, port.actions.image, directionId)}
    onSelect={directionId => attempt({ kind: 'general' }, port.actions.select, directionId)}
    onNext={() => port.navigate('banners')} />
  </>
}
