import { FactGrid as PublicFactGrid } from '../components/content/FactGrid'
import '../components/content/content.css'

/** Compatibility adapter for the original content/heading item shape. */
export function FactGrid({ items, ...props }) {
  return <PublicFactGrid {...props} items={items.map(({ content, heading, ...item }) => ({
    ...item, value: item.value ?? (heading ? <h2>{content}</h2> : content),
  }))} />
}
