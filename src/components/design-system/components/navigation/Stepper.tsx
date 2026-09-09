export type Step = { label: string; description?: string; disabled?: boolean }
export type StepperProps = { steps: Step[]; activeStep: number; ariaLabel?: string; className?: string }

/** Read-only workflow progress that identifies completed, current, and waiting steps. */
export function Stepper({ steps, activeStep, ariaLabel = 'Progress', className = '' }: StepperProps) {
  return <ol className={`ds-stepper ${className}`.trim()} aria-label={ariaLabel}>
    {steps.map((step, index) => {
      const status = index < activeStep ? 'complete' : index === activeStep ? 'current' : step.disabled ? 'disabled' : 'upcoming'
      return <li key={step.label} data-status={status} aria-current={status === 'current' ? 'step' : undefined}>
        <span className="ds-stepper__number" aria-hidden="true">{index + 1}</span>
        <span className="ds-stepper__content"><strong>{step.label}</strong>{step.description && <small>{step.description}</small>}</span>
      </li>
    })}
  </ol>
}
