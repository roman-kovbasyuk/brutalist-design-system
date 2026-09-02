import { Check } from 'lucide-react'

export const steps = [
  ['Brief', 'Campaign idea'],
  ['Copy', 'Audience, offer, and copy'],
  ['AI assets', 'Prompts, static, and video'],
  ['Banner preview', 'Select banner drafts'],
  ['Prepare for review', 'Review package'],
  ['Approval', 'Marketer confirmation'],
  ['Delivery', 'Assets and manifest'],
]

export function StepRail({ currentStep, maxStep, onStepChange }) {
  return (
    <nav className="step-rail" aria-label="Campaign stages">
      <p className="step-rail-title">Campaign</p>
      <ol>
        {steps.map(([label, detail], index) => {
          const number = index + 1
          const isComplete = number < maxStep && number !== currentStep
          const isAvailable = number <= maxStep
          return (
            <li key={label}>
              <button
                type="button"
                className="step-button"
                data-current={number === currentStep}
                data-complete={isComplete}
                aria-current={number === currentStep ? 'step' : undefined}
                aria-label={`${number}. ${label}: ${detail}`}
                disabled={!isAvailable}
                onClick={() => onStepChange(number)}
              >
                <span className="step-number">
                  {isComplete ? <Check size={13} aria-hidden="true" /> : String(number).padStart(2, '0')}
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
