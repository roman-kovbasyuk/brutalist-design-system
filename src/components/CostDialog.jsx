import { useEffect, useRef } from 'react'

function formatCurrency(value) {
  return `$${value.toFixed(2)}`
}

export function CostDialog({ estimate, onCancel, onConfirm }) {
  const dialogRef = useRef(null)
  const imageLabel = `${estimate.count} eligible image${estimate.count === 1 ? '' : 's'}`
  const confirmLabel = `Generate ${estimate.count} video${estimate.count === 1 ? '' : 's'} for ${formatCurrency(estimate.totalCost)}`

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()

    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  function handleCancel(event) {
    event.preventDefault()
    onCancel()
  }

  return (
    <dialog ref={dialogRef} className="cost-dialog" aria-labelledby="video-cost-title" onCancel={handleCancel}>
      <div className="cost-dialog__content">
        <header className="cost-dialog__header">
          <div className="cost-dialog__warning" aria-hidden="true">!</div>
          <div>
            <p className="cost-dialog__eyebrow">High-cost simulated generation</p>
            <h2 id="video-cost-title">Confirm video generation cost</h2>
          </div>
        </header>
        <p>Each motion asset is locally simulated, but this estimate models the higher production cost before you continue.</p>
        <dl className="cost-dialog__estimate">
          <div><dt>Eligible images</dt><dd>{imageLabel}</dd></div>
          <div><dt>Unit cost</dt><dd>{formatCurrency(estimate.unitCost)} per video</dd></div>
          <div><dt>Total</dt><dd>{formatCurrency(estimate.totalCost)} total estimated cost</dd></div>
        </dl>
        <div className="cost-dialog__actions">
          <button type="button" className="button button--secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="button button--primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  )
}
