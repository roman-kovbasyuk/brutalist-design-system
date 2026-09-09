import { useState } from 'react'
import { AppButton, DesignSystemRoot, Stack } from 'brutalist-design-system'
import 'brutalist-design-system/styles.css'

export function App() {
  const [count, setCount] = useState(0)

  return (
    <DesignSystemRoot>
      <Stack gap={4} style={{ padding: 24 }}>
        <h1>Package consumer</h1>
        <p>Pressed {count} times.</p>
        <AppButton variant="primary" onClick={() => setCount((value) => value + 1)}>
          Press me
        </AppButton>
      </Stack>
    </DesignSystemRoot>
  )
}
