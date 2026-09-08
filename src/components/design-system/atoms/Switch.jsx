import './switch.css'

/** Controlled native switch button; Enter/Space and disabled semantics are native. */
export function Switch({ label, checked = false, onChange, disabled = false, ...props }) {
  return <button {...props} type="button" className="v2-toggle-switch" role="switch" aria-label={label}
    aria-checked={checked} disabled={disabled} onClick={() => onChange?.(!checked)}><span aria-hidden="true" /></button>
}
