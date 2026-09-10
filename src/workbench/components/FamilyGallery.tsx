import { useMemo } from 'react'
import { TokenCopyTarget } from '../../components/design-system/atoms/TokenCopyTarget.jsx'
import type { Entry, Example, Family, Values } from '../registry/types'
import './family-gallery.css'

export type FamilyGalleryProps = {
  family: Family
  entries: Entry[]
}

function optionsFor(example: Example): Values {
  return { ...example.defaults, ...example.initialDraft }
}

function Groups({ family, entries }: { family: Family; entries: Entry[] }) {
  return family.groups.map((group) => {
    const examples = entries.flatMap((entry) => entry.examples
      .filter((example) => example.group === group)
      .map((example) => ({ entry, example })))

    if (examples.length === 0) return null

    return <section className="ds-family-gallery__group" key={group} aria-labelledby={`family-group-${family.id}-${group}`}>
      <h2 id={`family-group-${family.id}-${group}`}>{group}</h2>
      <div className={`ds-family-gallery__examples ds-family-gallery__examples--${family.layout}`}>
        {examples.map(({ entry, example }) => <ExampleTile key={`${entry.id}/${example.id}`} entry={entry} example={example} />)}
      </div>
    </section>
  })
}

function ExampleTile({ entry, example }: { entry: Entry; example: Example }) {
  const Component = example.Component
  const tokens = entry.tokens.filter(Boolean)

  return <article className="ds-example-tile" data-example={`${entry.id}/${example.id}`}>
    <div className="ds-example-tile__heading">
      <h3>{example.title}</h3>
      <p><TokenCopyTarget component copyValue={entry.id} label={`${entry.name} component ID`} inline>{entry.name}</TokenCopyTarget></p>
    </div>
    <div className="ds-example-tile__preview">
      <Component options={optionsFor(example)} draft={example.initialDraft} onDraftChange={() => undefined} />
    </div>
    <dl className="ds-example-tile__references">
      <div><dt>Component ID</dt><dd><TokenCopyTarget component copyValue={entry.id} label={`component ID ${entry.id}`} inline><code>{entry.id}</code></TokenCopyTarget></dd></div>
      {tokens.length > 0 && <div><dt>Tokens</dt><dd>{tokens.map((token) => <TokenCopyTarget key={token} copyValue={token} label={`token ${token}`} inline><code>{token}</code></TokenCopyTarget>)}</dd></div>}
    </dl>
  </article>
}

export function FamilyGallery({ family, entries }: FamilyGalleryProps) {
  const familyEntries = useMemo(() => entries.filter((entry) => entry.familyId === family.id), [entries, family.id])

  return <section className="ds-family-gallery" aria-label={`${family.title} examples`}>
    <Groups family={family} entries={familyEntries} />
  </section>
}
