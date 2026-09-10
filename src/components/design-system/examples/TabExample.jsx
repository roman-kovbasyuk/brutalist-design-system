import { useEffect, useRef, useState } from 'react'
import { Tab, TabPanel } from '../components/navigation/Tab'
import '../molecules/pill-tabs.css'

const items = [
  { value: 'ads', label: 'Ads', description: 'Static banners and short-form video.' },
  { value: 'web', label: 'Web', description: 'Landing pages and website pages.' },
  { value: 'presentations', label: 'Presentations', description: 'Slide decks for your next presentation.' },
  { value: 'other', label: 'Other', description: 'Business cards and email signatures.' },
]

export function TabExample() {
  const [value, setValue] = useState('ads')
  const root = useRef(null)
  useEffect(() => {
    if (window.location.hash === '#tab-example') root.current?.scrollIntoView({ block: 'center' })
  }, [])
  return <div ref={root} id="tab-example" data-component-reference="Tab">
    <Tab items={items} value={value} onValueChange={setValue} ariaLabel="Template categories" idPrefix="tab-example" />
    {items.map(item => <TabPanel key={item.value} value={item.value} activeValue={value} idPrefix="tab-example">
      <p>{item.description}</p>
    </TabPanel>)}
  </div>
}
