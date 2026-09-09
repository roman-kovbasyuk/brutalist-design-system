import { Progress } from '../feedback/Progress'

export type AITaskState = 'queued' | 'running' | 'succeeded' | 'failed'

export type AITaskStatusProps = {
  status: AITaskState
  label: string
  progress?: number
  className?: string
}

const stateLabel: Record<AITaskState, string> = {
  queued: 'Queued',
  running: 'Working',
  succeeded: 'Complete',
  failed: 'Failed',
}

/** Communicates caller-owned asynchronous work without executing or polling it. */
export function AITaskStatus({ status, label, progress, className = '' }: AITaskStatusProps) {
  const role = status === 'failed' ? 'alert' : 'status'
  return <section className={`ds-ai-task-status ${className}`.trim()} data-state={status} role={role}>
    <div className="ds-ai-task-status__summary"><span aria-hidden="true">{status === 'succeeded' ? '✓' : status === 'failed' ? '!' : '✦'}</span><span>{label}</span><small>{stateLabel[status]}</small></div>
    {status === 'running' && progress !== undefined && <Progress value={progress} label={label} />}
  </section>
}
