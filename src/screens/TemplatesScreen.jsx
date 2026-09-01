import { useState } from 'react'
import { TemplateCard } from '../components/TemplateCard.jsx'
import { templateFamilies, templates } from '../data/templates.js'

export function TemplatesScreen({ onChoose }) {
  const [filter, setFilter] = useState('all')
  const visible = filter === 'all' ? templates : templates.filter((template) => template.family === filter)

  return (
    <section className="reference-screen">
      <header className="page-header page-header--split">
        <div>
          <p className="page-context">Библиотека</p>
          <h1>20 композиций.<br />Один контракт.</h1>
        </div>
        <p className="page-description">
          Два мастер-соотношения, разные балансы текста и изображения. После ревью каждый шаблон
          перестраивается под четыре рекламных формата.
        </p>
      </header>

      <div className="filter-row" role="group" aria-label="Фильтр шаблонов">
        {templateFamilies.map((family) => (
          <button key={family.id} type="button" data-active={filter === family.id} onClick={() => setFilter(family.id)}>
            {family.label}
          </button>
        ))}
      </div>

      <div className="template-library">
        {visible.map((template) => <TemplateCard key={template.id} template={template} onChoose={onChoose} />)}
      </div>
    </section>
  )
}
