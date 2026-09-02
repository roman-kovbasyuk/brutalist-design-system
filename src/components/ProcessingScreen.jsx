import { Check, Sparkles } from 'lucide-react'

export function ProcessingScreen({ states, activeIndex, progress }) {
  const activeState = states[activeIndex] ?? states[0]

  return (
    <section className="processing-screen" aria-labelledby="processing-title">
      <p className="processing-screen__label"><Sparkles size={15} aria-hidden="true" />Local simulated analysis</p>
      <h1 id="processing-title">Preparing your campaign</h1>
      <p className="processing-screen__active" aria-live="polite" aria-atomic="true">{activeState}</p>
      <div
        className="processing-screen__progress"
        role="progressbar"
        aria-label="Brief analysis progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-valuetext={`${activeState} — ${progress}% complete`}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <ol className="processing-screen__states" aria-label="Brief analysis states">
        {states.map((state, index) => {
          const isComplete = index < activeIndex
          const isActive = index === activeIndex

          return (
            <li key={state} data-state={isComplete ? 'complete' : isActive ? 'active' : 'pending'}>
              <span aria-hidden="true">{isComplete ? <Check size={14} /> : String(index + 1).padStart(2, '0')}</span>
              <span>{state}</span>
              {isComplete && <span className="sr-only">Complete</span>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
