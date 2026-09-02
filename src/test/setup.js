import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

const localRecords = new Map()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem(key) { return localRecords.get(key) ?? null },
    setItem(key, value) { localRecords.set(key, String(value)) },
    removeItem(key) { localRecords.delete(key) },
    clear() { localRecords.clear() },
  },
})

if (!HTMLDialogElement.prototype.showModal) {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.__opener = document.activeElement
        this.setAttribute('open', '')
        this.querySelector('button')?.focus()
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute('open')
        this.__opener?.focus()
      },
    },
  })
}

afterEach(cleanup)
beforeEach(() => {
  window.scrollTo = vi.fn()
})
