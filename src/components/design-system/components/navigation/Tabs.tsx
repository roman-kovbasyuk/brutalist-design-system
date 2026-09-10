import { Tab, type TabProps } from './Tab'

// Preserve the legacy wrapper and className placement for existing consumers.
export function Tabs({ className = '', ...props }: TabProps) {
  return <div className={className}><Tab {...props} /></div>
}

export { TabPanel } from './Tab'
export type { TabItem, TabProps as TabsProps, TabPanelProps } from './Tab'
