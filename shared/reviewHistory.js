const allowedSequences = new Map([
  ['sent', 'in_review'],
  ['sent,changes_requested', 'changes_requested'],
  ['sent,ready', 'ready'],
  ['sent,ready,rejected', 'changes_requested'],
  ['sent,ready,approved', 'approved'],
  ['sent,ready,approved,delivered', 'delivered'],
])

export class InvalidReviewHistoryError extends Error {
  constructor() {
    super('Review event history is invalid')
    this.name = 'InvalidReviewHistoryError'
    this.code = 'invalid_review_history'
  }
}

function time(value) {
  const instant = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(instant)) throw new InvalidReviewHistoryError()
  return instant
}

export function orderReviewEvents(events) {
  if (!Array.isArray(events)) throw new InvalidReviewHistoryError()
  return [...events].sort((left, right) => {
    const byTime = time(left?.createdAt) - time(right?.createdAt)
    if (byTime !== 0) return byTime
    return String(left?.id ?? '').localeCompare(String(right?.id ?? ''))
  })
}

export function deriveReviewStatus(events) {
  const ordered = orderReviewEvents(events)
  const sequence = ordered.map((event) => event?.eventType).join(',')
  const status = allowedSequences.get(sequence)
  if (!status) throw new InvalidReviewHistoryError()
  return status
}
