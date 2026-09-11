import { useState } from 'react'
import { AppButton, DesignSystemRoot, Stack, Tabs, TabPanel } from 'brutalist-design-system'
import 'brutalist-design-system/styles.css'

export function App() {
  const [count, setCount] = useState(0)
  const [tab, setTab] = useState('usage')

  return (
    <DesignSystemRoot>
      <Stack gap={4} style={{ padding: 24 }}>
        <h1>Package consumer</h1>
        <p>Pressed {count} times.</p>
        <AppButton variant="primary" onClick={() => setCount((value) => value + 1)}>
          Press me
        </AppButton>
        <Tabs idPrefix="consumer" ariaLabel="Package examples" value={tab} onValueChange={setTab}
          items={[{ value: 'usage', label: 'How to use' }, { value: 'example', label: 'Live example' }, { value: 'locked', label: 'Unavailable', disabled: true }]} />
        <TabPanel idPrefix="consumer" value="usage" activeValue={tab}>Public imports and stylesheet.</TabPanel>
        <TabPanel idPrefix="consumer" value="example" activeValue={tab}>A second package panel.</TabPanel>
        <TabPanel idPrefix="consumer" value="locked" activeValue={tab}>Unavailable panel.</TabPanel>
      </Stack>
    </DesignSystemRoot>
  )
}
