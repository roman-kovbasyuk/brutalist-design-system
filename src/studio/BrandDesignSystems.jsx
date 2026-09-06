import { studioTemplates } from '../../shared/studioTemplates.js'
import './brand-design-systems.css'

export function BrandDesignSystems() {
  return <section className="bs-brand-systems" aria-labelledby="brand-systems-title">
    <header className="bs-section-heading">
      <h1 id="brand-systems-title">Brand design systems</h1>
      <p>Colors, typography and visual rules for your banners. These do not change the Banner Studio interface.</p>
    </header>
    <h2>Current banner styles</h2>
    <p>For now, each bundled template keeps its own styling. These are template styles, not saved client brands.</p>
    <div className="bs-brand-styles">
      {studioTemplates.map(template => {
        const colors = [...new Set([
          template.presentation.backgroundColor,
          ...Object.values(template.presentation.slotColors),
          ...template.presentation.shapes.map(shape => shape.fill),
        ])]
        const fonts = [...new Set(template.slots.filter(slot => slot.fontFamily).map(slot => slot.fontFamily))]
        return <article className="bs-brand-style" key={template.id}>
          <div><h3>{template.name}</h3><p>Typography: {fonts.join(', ')}</p></div>
          <ul aria-label={`${template.name} colors`}>
            {colors.map(color => <li key={color}>
              <span className="bs-brand-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
              <span>{color}</span>
            </li>)}
          </ul>
        </article>
      })}
    </div>
    <section className="bs-brand-future" aria-labelledby="brand-future-title">
      <h2 id="brand-future-title">Multiple brands, one client</h2>
      <p>Creating and managing separate brand systems—with their own colors, fonts, logos and rules—is planned for a later release. Your existing banners stay unchanged.</p>
    </section>
  </section>
}
