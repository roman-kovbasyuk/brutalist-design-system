import type { ReactNode } from 'react'

export function DetailsLayout({ children }: { children: ReactNode }) {
  return <aside className="ds-example-details" aria-label="Example details">{children}</aside>
}
