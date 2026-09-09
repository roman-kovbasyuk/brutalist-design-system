import type { ReactNode } from 'react'
import { AITaskStatus } from '../../components/ai/AITaskStatus'

export type TaskState = 'idle' | 'running' | 'waiting' | 'partial' | 'ready' | 'cancelled' | 'failed'

export type AIWorkspaceProps = { prompt: string; onPromptChange(value: string): void; state: TaskState; message: string; result?: ReactNode; attachments?: ReactNode; onSubmit(): void; onCancel?(): void; onRetry?(): void; onApply?(): void; onRevise?(): void; readOnly?: boolean }
export function AIWorkspace({ prompt, onPromptChange, state, message, result, attachments, onSubmit, onCancel, onRetry, onApply, onRevise, readOnly = false }: AIWorkspaceProps) {
  const busy = state === 'running' || state === 'waiting'
  const status = state === 'failed' ? 'failed' : state === 'ready' ? 'succeeded' : state === 'running' || state === 'waiting' ? 'running' : 'queued'
  return <section className="ds-ai-workspace" aria-label="AI workspace"><div className="ds-ai-workspace__prompt"><label htmlFor="ai-workspace-prompt">Prompt</label><textarea id="ai-workspace-prompt" value={prompt} onChange={e => onPromptChange(e.target.value)} readOnly={readOnly} /><div>{attachments}</div><button type="button" onClick={onSubmit} disabled={readOnly || busy || !prompt.trim()}>Run task</button></div><AITaskStatus status={status} label={message} />{busy && onCancel && <button type="button" onClick={onCancel}>Cancel</button>}{state === 'failed' && onRetry && <button type="button" onClick={onRetry}>Retry</button>}{result && <section className="ds-ai-workspace__result" aria-label="Result"><div>{result}</div>{onApply && <button type="button" onClick={onApply} disabled={busy}>Apply</button>}{onRevise && <button type="button" onClick={onRevise} disabled={busy}>Revise</button>}</section>}</section>
}
