import { Sparkles } from 'lucide-react'
import { ResponsiveSpecimen } from '../components/design-system/ResponsiveSpecimen.jsx'
import { ControlSpecimens, NavigationSpecimens } from '../components/design-system/ControlSpecimens.jsx'
import {
  ContentObjectSpecimens,
  DataSpecimens,
  FeedbackSpecimens,
} from '../components/design-system/DataSpecimens.jsx'
import { MotionSpecimens } from '../components/design-system/MotionSpecimens.jsx'
import { SpecimenSection } from '../components/design-system/SpecimenSection.jsx'
import { UIBlocks } from '../components/design-system/UIBlocks.jsx'
import '../styles/design-system.css'

const colors = [
  { name: 'Canvas', value: '#f4f4f0', token: 'var(--v2-canvas)' },
  { name: 'Surface', value: '#ffffff', token: 'var(--v2-surface)' },
  { name: 'Ink', value: '#000000', token: 'var(--v2-ink)' },
  { name: 'Accent', value: '#79d9ff', token: 'var(--v2-accent)' },
  { name: 'Success', value: '#23a094', token: 'var(--v2-success)' },
  { name: 'Danger', value: '#dc341e', token: 'var(--v2-danger)' },
  { name: 'Muted', value: '50% black', token: 'var(--v2-muted)' },
]

const typeRoles = [
  { name: 'Page title', value: '48px', className: 'v2-type-sample--page' },
  { name: 'Display', value: '32px', className: 'v2-type-sample--display' },
  { name: 'Section title', value: '24px', className: 'v2-type-sample--section' },
  { name: 'Component title', value: '20px', className: 'v2-type-sample--component' },
  { name: 'Body and controls', value: '16px / 22px', className: 'v2-type-sample--body' },
  { name: 'Metadata', value: '14px', className: 'v2-type-sample--meta' },
]

const spacingSteps = [4, 8, 12, 16, 24, 32, 48, 64]
const iconSizes = [16, 20, 24]

export function DesignSystemScreen() {
  return (
    <div className="system-screen--v2">
      <header className="v2-page-header">
        <div>
          <h1>Banner Studio design system</h1>
        </div>
        <p className="v2-page-header__intro">
          A practical reference for the foundations, components, states, and responsive
          behavior that shape the Banner Studio interface.
        </p>
      </header>

      <SpecimenSection
        index={1}
        title="Foundations"
        description="The shared visual constraints behind every production surface."
        className="v2-section--foundations"
      >
        <div className="v2-foundation-group v2-foundation-group--colors">
          <div className="v2-foundation-group__heading">
            <h3>Color</h3>
            <p>Warm structural neutrals with explicit action and status colors.</p>
          </div>
          <div className="v2-color-grid">
            {colors.map((color) => (
              <div className="v2-color-swatch" key={color.name}>
                <span className="v2-color-swatch__sample" style={{ background: color.token }} />
                <strong>{color.name}</strong>
                <small>{color.value}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="v2-foundation-group">
          <div className="v2-foundation-group__heading">
            <h3>Typography</h3>
            <p>Regular-weight roles with a compact, readable base rhythm.</p>
          </div>
          <div className="v2-type-grid">
            {typeRoles.map((role) => (
              <div className={`v2-type-sample ${role.className}`} key={role.name}>
                <span>{role.name}</span>
                <p>Make creative work clear.</p>
                <small>{role.value}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="v2-foundation-group">
          <div className="v2-foundation-group__heading">
            <h3>Spacing</h3>
            <p>4px base unit</p>
          </div>
          <div className="v2-spacing-grid">
            {spacingSteps.map((step) => (
              <div className="v2-spacing-step" key={step}>
                <span style={{ width: step, height: step }} />
                <small>{step}px</small>
              </div>
            ))}
          </div>
        </div>

        <div className="v2-foundation-grid">
          <div className="v2-foundation-card">
            <h3>Shape</h3>
            <div className="v2-shape-samples">
              <div><span className="v2-shape-sample v2-shape-sample--corner" /><small>4px corner</small></div>
              <div><span className="v2-shape-sample v2-shape-sample--circle" /><small>Circle</small></div>
              <div>
                <span className="v2-status-pill"><span aria-hidden="true" />Ready</span>
                <small>Compact status</small>
              </div>
            </div>
          </div>

          <div className="v2-foundation-card">
            <h3>Borders</h3>
            <div className="v2-border-sample">
              <span />
              <p><strong>1px black rule</strong><small>No ambient shadows</small></p>
            </div>
          </div>

          <div className="v2-foundation-card">
            <h3>Icon sizes</h3>
            <div className="v2-icon-sizes">
              {iconSizes.map((size) => (
                <div key={size}><Sparkles aria-hidden="true" size={size} /><small>{size}px</small></div>
              ))}
            </div>
          </div>

          <div className="v2-foundation-card">
            <h3>Motion timing</h3>
            <dl className="v2-motion-timing">
              <div><dt>Feedback</dt><dd>150ms</dd></div>
              <div><dt>Disclosure</dt><dd>200ms</dd></div>
              <div><dt>Easing</dt><dd>Ease out</dd></div>
            </dl>
          </div>
        </div>
      </SpecimenSection>

      <ControlSpecimens />
      <NavigationSpecimens />
      <FeedbackSpecimens />
      <DataSpecimens />
      <ContentObjectSpecimens />
      <MotionSpecimens />
      <SpecimenSection index={9} title="Responsive behavior" description="Reference reflows for compact and mobile workspaces.">
        <ResponsiveSpecimen />
      </SpecimenSection>
      <UIBlocks />
    </div>
  )
}
