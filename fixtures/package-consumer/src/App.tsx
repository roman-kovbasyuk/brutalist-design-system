import { useState } from 'react'
import { AppButton, DesignSystemRoot, Stack, Tab, TabPanel, type TabItem } from 'brutalist-design-system'
import 'brutalist-design-system/styles.css'

export function App() {
  const [count, setCount] = useState(0)
  const [category, setCategory] = useState('ads')
  const items: TabItem[] = [
    { value: 'ads', label: 'Ads' }, { value: 'web', label: 'Web' },
    { value: 'presentations', label: 'Presentations' }, { value: 'other', label: 'Other' },
  ]

  return (
    <DesignSystemRoot>
      <Stack gap={4} style={{ padding: 24 }}>
        <h1>Package consumer</h1>
        <Tab items={items} value={category} onValueChange={setCategory} ariaLabel="Template categories" idPrefix="consumer-categories" />
        {items.map(item => <TabPanel key={item.value} value={item.value} activeValue={category} idPrefix="consumer-categories">
          <p>{item.label} templates</p>
        </TabPanel>)}
        <p>Pressed {count} times.</p>
        <AppButton variant="primary" onClick={() => setCount((value) => value + 1)}>
          Press me
        </AppButton>
      </Stack>
    </DesignSystemRoot>
  )
}
