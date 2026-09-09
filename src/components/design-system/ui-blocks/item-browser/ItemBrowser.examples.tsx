import { useState } from 'react'
import { ItemBrowser, type Item } from './ItemBrowser'

const exampleItems: Item[] = [{ id: 'guide', title: 'Getting started guide', description: 'A practical introduction.', status: 'Ready' }]
export function ItemBrowserExample() { const [query, setQuery] = useState(''); const [view, setView] = useState<'list' | 'grid'>('list'); const [selected, setSelected] = useState<string[]>([]); return <ItemBrowser items={exampleItems} total={1} query={query} onQueryChange={setQuery} page={1} pageCount={1} onPageChange={() => {}} view={view} onViewChange={setView} selectedIds={selected} onSelectionChange={setSelected} onOpen={() => {}} /> }
