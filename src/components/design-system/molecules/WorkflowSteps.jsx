import { Check } from 'lucide-react'
import '../workflow-steps.css'

export function WorkflowSteps({ items, ariaLabel = 'Campaign workflow', onNavigate }) {
  return <ol className="v2-workflow-steps" aria-label={ariaLabel}>
    {items.map((item, index) => <li key={item.label} className={item.complete ? 'is-complete' : undefined} aria-current={item.current ? 'step' : undefined}>
      <span aria-hidden="true">{item.complete ? <Check size={16} /> : index + 1}</span>
      <div>
        {item.href ? <a href={item.href} aria-current={item.current ? 'step' : undefined} aria-disabled={item.disabled || undefined} onClick={(event) => {
          if (item.disabled || onNavigate) event.preventDefault()
          if (!item.disabled) onNavigate?.(index)
        }}><strong>{item.label}</strong></a> : <strong>{item.label}</strong>}
        {item.context && <small>{item.context}</small>}
      </div>
    </li>)}
  </ol>
}
