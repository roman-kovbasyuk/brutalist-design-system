import { PromptComposerExample } from '../components/design-system/examples/PromptComposerExample.jsx'
import { LibraryIndex } from '../components/design-system/examples/LibraryIndex.jsx'
import { TokenCopyTarget } from '../components/design-system/atoms/TokenCopyTarget.jsx'
import { Sparkles } from 'lucide-react'
import { ResponsiveSpecimen } from '../components/design-system/examples/ResponsiveSpecimen.jsx'
import { ControlSpecimens, NavigationSpecimens } from '../components/design-system/examples/ControlSpecimens.jsx'
import {
  ContentObjectSpecimens,
  DataSpecimens,
  FeedbackSpecimens,
} from '../components/design-system/examples/DataSpecimens.jsx'
import { MotionSpecimens } from '../components/design-system/examples/MotionSpecimens.jsx'
import { SpecimenSection } from '../components/design-system/examples/SpecimenSection.jsx'
import { UIBlocks } from '../components/design-system/examples/UIBlocks.jsx'
import '../styles/design-system.css'

const colors = [
  { name: 'Canvas', value: '#f4f4f0', token: '--v2-canvas' },
  { name: 'Surface', value: '#ffffff', token: '--v2-surface' },
  { name: 'Ink', value: '#000000', token: '--v2-ink' },
  { name: 'Accent', value: '#79d9ff', token: '--v2-accent' },
  { name: 'Success', value: '#23a094', token: '--v2-success' },
  { name: 'Danger', value: '#dc341e', token: '--v2-danger' },
  { name: 'Muted swatch — decorative only', value: '50% black', token: '--v2-muted' },
]

const typeRoles = [
  { name: 'H1', key: 'h1', size: 48, line: 52, weight: 500 },
  { name: 'H2', key: 'h2', size: 32, line: 36, weight: 500 },
  { name: 'H3', key: 'h3', size: 24, line: 28, weight: 500 },
  { name: 'H4', key: 'h4', size: 20, line: 24, weight: 500 },
  { name: 'H5', key: 'h5', size: 18, line: 24, weight: 500 },
  { name: 'Lead Large', key: 'lead-large', size: 24, line: 36, weight: 400 },
  { name: 'Lead Medium', key: 'lead-medium', size: 20, line: 28, weight: 400 },
  { name: 'Body', key: 'body', size: 16, line: 22, weight: 400 },
  { name: 'Small text', key: 'small', size: 14, line: 20, weight: 400 },
]

const spacingSteps = [
  { value: 4, token: '--v2-space-1' },
  { value: 8, token: '--v2-space-2' },
  { value: 12, token: '--v2-space-3' },
  { value: 16, token: '--v2-space-4' },
  { value: 24, token: '--v2-space-6' },
  { value: 32, token: '--v2-space-8' },
  { value: 48, token: '--v2-space-12' },
  { value: 64, token: '--v2-space-16' },
]
const iconSizes = [16, 20, 24]

export function DesignSystemScreen() {
  return (
    <div className="system-screen--v2">
      <header className="v2-page-header">
        <div>
          <h1>Application design system</h1>
        </div>
        <p className="v2-page-header__intro">
          A practical reference for the foundations, components, states, and responsive
          behavior that shape every Banner Studio interface. Banner brand styles are separate.
        </p>
      </header>

      <LibraryIndex />

      <SpecimenSection
        index={1}
        title="Foundations"
        description="Shared visual values for every production surface."
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
                <TokenCopyTarget copyValue={color.token} label={`${color.name} token`} className="v2-color-token-target">
                  <span className="v2-color-swatch__sample" style={{ background: `var(${color.token})` }} aria-hidden="true" />
                </TokenCopyTarget>
                <strong>{color.name}</strong>
                <small>{color.value}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="v2-foundation-group" id="ds-typography">
          <div className="v2-foundation-group__heading">
            <h3>Typography</h3>
            <p>Each sample shows its size, line height, and weight. Click to copy the combined token.</p>
          </div>
          <div className="v2-type-grid">
            {typeRoles.map((role) => (
              <TokenCopyTarget
                key={role.name}
                copyValue={`font: var(${role.weight === 500 ? '--v2-weight-heading' : '--v2-weight-text'}) var(--v2-text-${role.key}) / var(--v2-line-${role.key}) var(--v2-font);`}
                label={`${role.name} typography token`}
                className={`v2-type-sample v2-type-sample--${role.key}`}
              >
                <span className="v2-type-sample__name">{role.name}</span>
                <p className="v2-type-sample__copy">Make creative work clear.</p>
                <small className="v2-type-sample__value">{role.size}px / {role.line}px · {role.weight}</small>
              </TokenCopyTarget>
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
              <TokenCopyTarget copyValue={step.token} label={`${step.value}px spacing token`} className="v2-spacing-step" key={step.token}>
                <span style={{ width: step.value, height: step.value }} aria-hidden="true" />
                <small>{step.value}px</small>
              </TokenCopyTarget>
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
      <PromptComposerExample />
    </div>
  )
}
