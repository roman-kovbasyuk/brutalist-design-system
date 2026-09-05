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

export function StepRail({ currentStep, maxStep, onStepChange, items = steps, hiddenSteps = [5], scrollOnChange = true, disabled = false, className = '', ariaLabel = 'Campaign stages' }) {
  function jumpTo(number) {
    onStepChange(number)
    if (scrollOnChange) document.getElementById(`campaign-step-${number}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className={`step-rail ${className}`} aria-label={ariaLabel}>
      <p className="step-rail-title">Campaign</p>
      <ol>
        {items.map(([label], index) => {
          const number = index + 1
          if (hiddenSteps.includes(number)) return null
          const isComplete = number < maxStep && number !== currentStep
          const isAvailable = number <= maxStep
          return (
            <li key={`${number}-${label}`}>
              <button
                type="button"
                className="step-button"
                data-current={number === currentStep}
                data-complete={isComplete}
                aria-current={number === currentStep ? 'step' : undefined}
                aria-label={`${number}. ${label}`}
                disabled={disabled || !isAvailable}
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
