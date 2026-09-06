import { CopyView } from './CopyView.jsx'

export default function CopyModule({ port }) {
  return <CopyView {...port} heading={false} onNext={port.navigate ? () => port.navigate('visuals') : undefined} />
}
