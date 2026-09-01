import { Check } from 'lucide-react'

export const steps = [
  ['Бриф', 'Идея кампании'],
  ['Копирайт', 'Сообщение и промпты'],
  ['Визуалы', 'Пять направлений'],
  ['Шаблон', 'Композиция'],
  ['Сборка', 'Черновой мастер'],
  ['Ревью', 'Проверка в Figma'],
  ['Результат', 'Четыре формата'],
]

export function StepRail({ currentStep, maxStep, onStepChange }) {
  return (
    <nav className="step-rail" aria-label="Этапы кампании">
      <p className="step-rail-title">Кампания</p>
      <ol>
        {steps.map(([label, detail], index) => {
          const number = index + 1
          const isComplete = number < currentStep
          const isAvailable = number <= maxStep
          return (
            <li key={label}>
              <button
                type="button"
                className="step-button"
                data-current={number === currentStep}
                data-complete={isComplete}
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
