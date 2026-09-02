import { Check } from 'lucide-react'

export const steps = [
  ['Brief', 'Campaign idea'],
  ['Copy', 'Audience, offer, and copy'],
  ['AI assets', 'Prompts, static, and video'],
  ['Banners', 'Select banner drafts'],
  ['Review', 'Review package'],
  ['Review', 'Marketer confirmation'],
  ['Assets ready', 'Assets and manifest'],
]

export function StepRail({ currentStep, maxStep, onStepChange }) {
  function jumpTo(number) {
    onStepChange(number)
    document.getElementById(`campaign-step-${number}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className="step-rail" aria-label="Campaign stages">
      <p className="step-rail-title">Campaign</p>
      <ol>
        {steps.map(([label], index) => {
          const number = index + 1
          if (number === 5) return null
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
                aria-label={`${number}. ${label}`}
                disabled={!isAvailable}
                onClick={() => jumpTo(number)}
              >
                <span className="step-number">
                  {isComplete ? <Check size={13} aria-hidden="true" /> : String(number)}
                </span>
                <span>
                  <strong>{label}</strong>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
