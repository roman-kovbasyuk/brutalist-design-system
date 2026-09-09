import { type CSSProperties, useId } from 'react'

export type ProgressProps = {
  value: number
  max?: number
  label: string
  showValue?: boolean
  className?: string
}

/** An accessible determinate progress indicator. */
export function Progress({ value, max = 100, label, showValue = true, className = '' }: ProgressProps) {
  const labelId = useId()
  const boundedValue = Math.max(0, Math.min(value, max))
  const percentage = Math.round((boundedValue / max) * 100)
  const progressStyle = { '--v2-progress-scale': percentage / 100 } as CSSProperties
  return <div className={`ds-progress ${className}`.trim()}>
    <div className="ds-progress__header"><span id={labelId}>{label}</span>{showValue && <span>{percentage}%</span>}</div>
    <div className="ds-progress__track" role="progressbar" aria-labelledby={labelId} aria-valuemin={0} aria-valuemax={max} aria-valuenow={boundedValue}>
      <span className="ds-progress__value" style={progressStyle} />
    </div>
  </div>
}
