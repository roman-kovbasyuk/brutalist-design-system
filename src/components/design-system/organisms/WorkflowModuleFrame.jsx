import './workflow-module-frame.css'

/** Domain-free workflow card: its caller owns state, actions and navigation. */
export function WorkflowModuleFrame({ id, title, busy = false, children }) {
  return <section id={id} className="v2-workflow-module bs-long-section" aria-labelledby={`${id}-title`} aria-busy={busy || undefined}>
    <header className="v2-workflow-module-heading"><h2 id={`${id}-title`}>{title}</h2></header>
    {children}
  </section>
}
