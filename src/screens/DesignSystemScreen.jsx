import { useEffect, useState } from 'react'
import { PromptComposerExample } from '../components/design-system/examples/PromptComposerExample.jsx'
import { LibraryIndex } from '../components/design-system/examples/LibraryIndex.jsx'
import { LibraryComponentPreviews } from '../components/design-system/examples/LibraryComponentPreviews.jsx'
import { TokenCopyTarget } from '../components/design-system/atoms/TokenCopyTarget.jsx'
import { CopyModeProvider } from '../components/design-system/atoms/CopyMode.jsx'
import { ControlSpecimens, NavigationSpecimens } from '../components/design-system/examples/ControlSpecimens.jsx'
import {
  ContentObjectSpecimens,
  DataSpecimens,
  FeedbackSpecimens,
} from '../components/design-system/examples/DataSpecimens.jsx'
import { MotionSpecimens } from '../components/design-system/examples/MotionSpecimens.jsx'
import { SpecimenSection } from '../components/design-system/examples/SpecimenSection.jsx'
import { UIBlocks, uiBlockCatalog } from '../components/design-system/examples/UIBlocks.jsx'
import { BasicsCatalog } from '../components/design-system/examples/BasicsCatalog.jsx'
import { componentGroups } from '../components/design-system/examples/component-groups.js'
import { basicGroups } from '../components/design-system/foundations/basics-catalog.js'
import '../styles/design-system.css'
import { sitePath } from './site-path.js'

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
  { name: 'Lead L', key: 'lead-large', size: 24, line: 36, weight: 500 },
  { name: 'Lead M', key: 'lead-medium', size: 20, line: 28, weight: 500 },
  { name: 'Body', key: 'body', size: 16, line: 22, weight: 500 },
  { name: 'Small', key: 'small', size: 14, line: 20, weight: 400 },
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
export function DesignSystemScreen({ overviewOnRoot = false }) {
  return <CopyModeProvider><DesignSystemContent overviewOnRoot={overviewOnRoot} /></CopyModeProvider>
}

function DesignSystemContent({ overviewOnRoot = false }) {
  const [basicsQuery, setBasicsQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState(() => new URLSearchParams(window.location.search).get('section') === 'components' ? 'Components' : new URLSearchParams(window.location.search).get('section') === 'ui-blocks' ? 'UI blocks' : new URLSearchParams(window.location.search).get('section') === 'basics' ? 'Basics' : 'all')

  useEffect(() => {
    const syncSection = () => {
      const section = new URLSearchParams(window.location.search).get('section')
      setActiveCategory(section === 'components' ? 'Components' : section === 'ui-blocks' ? 'UI blocks' : section === 'basics' ? 'Basics' : 'all')
    }
    window.addEventListener('popstate', syncSection)
    return () => window.removeEventListener('popstate', syncSection)
  }, [])

  function selectCategory(category) {
    const section = category === 'Components' ? 'components' : category === 'UI blocks' ? 'ui-blocks' : 'basics'
    const url = new URL(window.location.href)
    url.searchParams.set('section', section)
    url.searchParams.delete('mode')
    url.searchParams.delete('family')
    url.hash = ''
    window.history.pushState({}, '', url)
    setActiveCategory(category)
  }

  const isOverview = overviewOnRoot && activeCategory === 'all'

  return (
    <div className="ds-workspace">
      <LibraryIndex activeCategory={isOverview ? 'overview' : activeCategory} onCategoryChange={selectCategory}
        navigationItems={activeCategory === 'Basics' ? basicGroups.map(group => ({ ...group, href: `#basics-${group.id}` })) : activeCategory === 'Components' ? componentGroups : activeCategory === 'UI blocks' ? uiBlockCatalog.map(block => ({ id: block.id, name: block.name, group: block.group, href: `#ds-${block.id}` })) : undefined}
        onQueryChange={activeCategory === 'Basics' ? setBasicsQuery : undefined} />
      <div className="system-screen--v2 ds-catalog" id="ds-catalog">
      {isOverview && <section className="ds-overview" aria-labelledby="ds-overview-title">
        <div className="ds-overview__intro">
          <span className="ds-overview__eyebrow">Reference library</span>
          <h2 id="ds-overview-title">Choose a section to explore</h2>
          <p>Start with shared foundations, browse reusable components, or see complete UI blocks in context.</p>
        </div>
        <div className="ds-overview__cards">
          {[['Basics', 'Foundations, tokens, controls, and shared visual values.', 'basics'], ['Components', 'Reusable interaction patterns and component states.', 'components'], ['UI blocks', 'Responsive compositions and complete interface examples.', 'ui-blocks']].map(([title, description, section]) => (
            <a key={section} href={sitePath(`/design-system?section=${section}`)} className="ds-overview__card">
              <span>{title}</span>
              <p>{description}</p>
              <small>Open section →</small>
            </a>
          ))}
        </div>
      </section>}

      {activeCategory === 'Basics' && <BasicsCatalog query={basicsQuery} />}
      {!isOverview && activeCategory === 'all' && <SpecimenSection
        index={1}
        title="Foundations"
        description="Shared visual values for every production surface."
        className="v2-section--foundations"
      >
        <div className="v2-foundation-group v2-foundation-group--colors">
          <div className="v2-foundation-group__heading">
            <h3>Color</h3>
            
          </div>
          <div className="v2-color-grid">
            {colors.map((color) => (
              <div className="v2-color-swatch" key={color.name}>
                <TokenCopyTarget copyValue={color.token} label={`${color.name} token`} className="v2-color-token-target">
                  <span className="v2-color-swatch__sample" style={{ background: `var(${color.token})` }} aria-hidden="true" />
                </TokenCopyTarget>
                <TokenCopyTarget copyValue={color.token} label={`${color.name} name`} inline><strong>{color.name}</strong></TokenCopyTarget>
                <small>{color.value}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="v2-foundation-group" id="ds-typography">
          <div className="v2-foundation-group__heading">
            <h3>Typography</h3>
            <p>Click a sample to copy</p>
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
                <p className="v2-type-sample__copy">Font text</p>
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
                <span
                  className="v2-spacing-step__measure"
                  style={{ '--v2-spacing-value': `${step.value}px` }}
                  aria-hidden="true"
                />
                <small>{step.value}px</small>
              </TokenCopyTarget>
            ))}
          </div>
        </div>

      </SpecimenSection>}

      {!isOverview && (activeCategory === 'Components' || activeCategory === 'all') && <div className="ds-components">
        <ControlSpecimens />
        <NavigationSpecimens />
        <FeedbackSpecimens />
        <DataSpecimens />
        <ContentObjectSpecimens />
        <MotionSpecimens />
      </div>}
      {!isOverview && (activeCategory === 'UI blocks' || activeCategory === 'all') && <>
        {activeCategory === 'all' && <SpecimenSection index={9} title="Responsive behavior" description="Reference reflows for compact and mobile workspaces.">
          <ResponsiveSpecimen />
        </SpecimenSection>}
        <UIBlocks />
        {activeCategory === 'all' && <>
          <PromptComposerExample />
          <LibraryComponentPreviews />
        </>}
      </>}
      </div>
    </div>
  )
}
import { ResponsiveSpecimen } from '../components/design-system/examples/ResponsiveSpecimen.jsx'
