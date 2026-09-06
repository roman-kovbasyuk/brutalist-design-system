import { afterEach, expect, test, vi } from 'vitest'
import { observeJob } from './jobObserver.js'

afterEach(() => vi.useRealTimers())

test('two consumers share one poller and receive the final job', async () => {
  vi.useFakeTimers()
  const api = { getJob: vi.fn().mockResolvedValueOnce({ id: 'j1', status: 'pending' })
    .mockResolvedValueOnce({ id: 'j1', status: 'succeeded' }) }
  const left = [], right = []
  const stopLeft = observeJob({ api, jobId: 'j1', onUpdate: job => left.push(job.status) })
  const stopRight = observeJob({ api, jobId: 'j1', onUpdate: job => right.push(job.status) })
  await vi.advanceTimersByTimeAsync(0)
  expect(api.getJob).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(900)
  expect(left).toEqual(['pending', 'succeeded'])
  expect(right).toEqual(['pending', 'succeeded'])
  await vi.advanceTimersByTimeAsync(5000)
  expect(api.getJob).toHaveBeenCalledTimes(2)
  stopLeft(); stopRight()
})

test('unsubscribing aborts only the read, never sends a cancellation mutation', async () => {
  let readSignal
  const api = { getJob: (_id, { signal }) => { readSignal = signal; return new Promise(() => {}) } }
  const stop = observeJob({ api, jobId: 'j1', onUpdate: () => {} })
  stop()
  expect(readSignal.aborted).toBe(true)
})

test('observation errors are reported locally and the poller is released', async () => {
  const errors = []
  const api = { getJob: async () => { throw new Error('Read failed') } }
  const stop = observeJob({ api, jobId: 'j1', onUpdate: () => {}, onError: error => errors.push(error.message) })
  await vi.waitFor(() => expect(errors).toEqual(['Read failed']))
  stop()
})
