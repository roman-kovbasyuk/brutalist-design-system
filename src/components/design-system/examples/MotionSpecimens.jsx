import { SpecimenCard } from './SpecimenCard.jsx'
import { SpecimenGrid } from './SpecimenGrid.jsx'
import { useEffect, useRef, useState } from 'react'
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Info,
  MoreHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { SpecimenSection } from './SpecimenSection.jsx'

export function MotionSpecimens() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isInlineConfirmationOpen, setIsInlineConfirmationOpen] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isToastVisible, setIsToastVisible] = useState(false)
  const dialogTriggerRef = useRef(null)
  const dialogRef = useRef(null)
  const cancelButtonRef = useRef(null)
  const inlineTriggerRef = useRef(null)
  const inlineCancelRef = useRef(null)
  const restoreInlineFocusRef = useRef(false)

  useEffect(() => {
    if (isInlineConfirmationOpen) {
      inlineCancelRef.current?.focus()
      restoreInlineFocusRef.current = true
    } else if (restoreInlineFocusRef.current) {
      inlineTriggerRef.current?.focus()
      restoreInlineFocusRef.current = false
    }
  }, [isInlineConfirmationOpen])

  useEffect(() => {
    if (!isDialogOpen) return undefined

    const dialog = dialogRef.current
    if (typeof dialog?.showModal === 'function') {
      dialog.showModal()
    } else {
      dialog?.setAttribute('open', '')
    }
    cancelButtonRef.current?.focus()

    return () => {
      if (dialog?.open && typeof dialog.close === 'function') dialog.close()
    }
  }, [isDialogOpen])

  function closeDialog() {
    // Release native modal inertness before focusing the trigger outside it.
    const dialog = dialogRef.current
    if (dialog?.open && typeof dialog.close === 'function') dialog.close()
    setIsDialogOpen(false)
    dialogTriggerRef.current?.focus()
  }

  function handleDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDialog()
      return
    }

    if (event.key !== 'Tab') return
    const focusableButtons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
    const firstButton = focusableButtons[0]
    const lastButton = focusableButtons.at(-1)

    if (event.shiftKey && document.activeElement === firstButton) {
      event.preventDefault()
      lastButton?.focus()
    } else if (!event.shiftKey && document.activeElement === lastButton) {
      event.preventDefault()
      firstButton?.focus()
    }
  }

  return (
    <>
      <SpecimenSection
        index={7}
        title="Overlays"
        description="Layered actions and supporting information that preserve context."
      >
        <SpecimenCard
          title="Menu and supporting information"
          description="Labels and actions remain visible without pointer hover."
        >
          <SpecimenGrid>
            <div className="v2-overlay-demo" data-component-reference="MotionSpecimens — Action dropdown (.v2-dropdown)">
              <span className="v2-demo-label">Dropdown</span>
              <div className="v2-dropdown">
                <button
                  className="v2-button v2-button--secondary"
                  type="button"
                  aria-expanded={isDropdownOpen}
                  aria-controls="v2-asset-actions"
                  onClick={() => setIsDropdownOpen((current) => !current)}
                >
                  <MoreHorizontal aria-hidden="true" size={18} />
                  Open asset actions
                  <ChevronDown aria-hidden="true" size={18} />
                </button>
                {isDropdownOpen && (
                  <div className="v2-dropdown__popover" id="v2-asset-actions" role="group" aria-label="Asset actions">
                    <button type="button" onClick={() => setIsDropdownOpen(false)}>
                      <Download aria-hidden="true" size={17} />
                      Download asset
                    </button>
                    <button type="button" onClick={() => setIsDropdownOpen(false)}>
                      <Copy aria-hidden="true" size={17} />
                      Duplicate asset
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="v2-overlay-demo" data-component-reference="MotionSpecimens — Tooltip (.v2-tooltip)">
              <span className="v2-demo-label">Tooltip</span>
              <button
                className="v2-button v2-button--secondary"
                type="button"
                aria-describedby="v2-motion-tooltip"
              >
                <Info aria-hidden="true" size={18} />
                About motion feedback
              </button>
              <span className="v2-tooltip" id="v2-motion-tooltip" role="tooltip">
                Motion never hides an action or status.
              </span>
            </div>

            <div className="v2-overlay-demo" data-component-reference="MotionSpecimens — Toast (.v2-overlay-toast)">
              <span className="v2-demo-label">Toast</span>
              <button
                className="v2-button v2-button--primary"
                type="button"
                onClick={() => setIsToastVisible(true)}
              >
                <Bell aria-hidden="true" size={18} />
                Show success toast
              </button>
              {isToastVisible && (
                <div className="v2-toast v2-overlay-toast" role="status" aria-label="Motion preference saved">
                  <span><strong>Motion preference saved</strong><small>Reduced motion is respected automatically.</small></span>
                  <button
                    className="v2-button v2-button--icon"
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={() => setIsToastVisible(false)}
                  >
                    <X aria-hidden="true" size={18} />
                  </button>
                </div>
              )}
            </div>
          </SpecimenGrid>
        </SpecimenCard>

        <SpecimenCard
          title="Inline confirmation"
          copyValue="MotionSpecimens — Inline confirmation (.v2-confirmation-panel)"
          description="A lightweight destructive choice stays beside its initiating action."
        >
          {isInlineConfirmationOpen ? (
            <div className="v2-confirmation-panel" role="group" aria-label="Confirm draft deletion">
              <span><strong>Delete campaign draft?</strong><small>This removes the local draft only.</small></span>
              <div className="v2-confirmation-panel__actions">
                <button
                  className="v2-button v2-button--secondary"
                  type="button"
                  onClick={() => setIsInlineConfirmationOpen(false)}
                  ref={inlineCancelRef}
                >
                  Keep draft
                </button>
                <button
                  className="v2-button v2-button--danger"
                  type="button"
                  onClick={() => setIsInlineConfirmationOpen(false)}
                >
                  Delete draft
                </button>
              </div>
            </div>
          ) : (
            <button
              className="v2-button v2-button--danger"
              type="button"
              onClick={() => setIsInlineConfirmationOpen(true)}
              ref={inlineTriggerRef}
            >
              <Trash2 aria-hidden="true" size={18} />
              Open inline confirmation
            </button>
          )}
        </SpecimenCard>

        <SpecimenCard
          title="Modal confirmation"
          copyValue="MotionSpecimens — Modal confirmation (.v2-modal)"
          description="The initiating control regains focus when the modal closes."
        >
          <button
            className="v2-button v2-button--danger"
            type="button"
            ref={dialogTriggerRef}
            onClick={() => setIsDialogOpen(true)}
          >
            <Trash2 aria-hidden="true" size={18} />
            Open confirmation dialog
          </button>
        </SpecimenCard>

        {isDialogOpen && (
          <div className="v2-modal-backdrop">
            <dialog
              className="v2-modal"
              ref={dialogRef}
              aria-modal="true"
              aria-labelledby="v2-modal-title"
              aria-describedby="v2-modal-description"
              onCancel={(event) => {
                event.preventDefault()
                closeDialog()
              }}
              onKeyDown={handleDialogKeyDown}
            >
              <span className="v2-demo-label">Destructive action</span>
              <h3 id="v2-modal-title">Delete generated asset?</h3>
              <p id="v2-modal-description">
                Oslo platform portrait will be removed from this campaign.
              </p>
              <div className="v2-modal__actions">
                <button
                  className="v2-button v2-button--secondary"
                  type="button"
                  ref={cancelButtonRef}
                  onClick={closeDialog}
                >
                  Cancel
                </button>
                <button className="v2-button v2-button--danger" type="button" onClick={closeDialog}>
                  Delete asset
                </button>
              </div>
            </dialog>
          </div>
        )}
      </SpecimenSection>

      <SpecimenSection
        index={8}
        title="Motion"
        description="Purposeful feedback, disclosure, and reduced-motion behavior."
      >
        <SpecimenCard
          title="Interaction laboratory"
          description="The same 150ms feedback contract serves actions and interactive cards."
        >
          <div className="v2-motion-lab">
            <div className="v2-motion-sample" data-component-reference={'AppButton variant="primary"'}>
              <span className="v2-demo-label">Button lift · 150ms</span>
              <button className="v2-button v2-button--primary" type="button">
                Preview button lift
              </button>
              <small>Hover lifts; keyboard focus adds an outline; press returns to the surface.</small>
            </div>

            <div className="v2-motion-sample" data-component-reference="MotionSpecimens — Interactive card (.v2-motion-card)">
              <span className="v2-demo-label">Card shadow · 150ms</span>
              <button className="v2-motion-card" type="button" aria-label="Preview card shadow">
                <span>Generated asset</span>
                <strong>Oslo platform portrait</strong>
                <small>Preview card shadow</small>
              </button>
              <small>The hard shadow communicates an interactive surface.</small>
            </div>
          </div>
        </SpecimenCard>

        <SpecimenCard
          title="Disclosure"
          description="Content appears in place without fading essential information."
        >
          <details className="v2-disclosure" data-component-reference="MotionSpecimens — Disclosure (.v2-disclosure)">
            <summary>
              <ChevronRight className="v2-disclosure__chevron" aria-hidden="true" size={20} />
              Disclosure behavior
            </summary>
            <p>The chevron rotates over 200ms.</p>
          </details>
          <div className="v2-reduced-motion-note" data-component-reference="MotionSpecimens — Reduced motion note (.v2-reduced-motion-note)">
            <strong>Reduced motion</strong>
            <p>Spatial movement, shadow transitions, rotation, and smooth scrolling become immediate.</p>
          </div>
        </SpecimenCard>
      </SpecimenSection>
    </>
  )
}
