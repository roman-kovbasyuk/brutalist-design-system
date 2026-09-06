import { ReviewView } from './ReviewView.jsx'

export default function ReviewModule({ port }) {
  return <ReviewView {...port} expectedInputKey={port.inputKey} />
}
