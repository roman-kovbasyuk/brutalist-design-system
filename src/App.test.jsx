import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import App from './App.jsx'

describe('Lingu Studio app', () => {
  test('exposes workflow, templates, and design system as primary destinations', () => {
    render(<App />)

    const navigation = screen.getByRole('navigation', { name: 'Основная навигация' })
    expect(within(navigation).getByRole('button', { name: 'Процесс' })).toBeVisible()
    expect(within(navigation).getByRole('button', { name: 'Шаблоны' })).toBeVisible()
    expect(within(navigation).getByRole('button', { name: 'Дизайн-система' })).toBeVisible()
  })

  test('completes the controlled flow and blocks final formats until approval', async () => {
    const user = userEvent.setup()
    render(<App />)

    const brief = screen.getByLabelText('Идея кампании')
    await user.clear(brief)
    await user.type(
      brief,
      'Запускаем интенсив норвежского языка. Скидка 15% до воскресенья для переезда в Осло.',
    )
    await user.click(screen.getByRole('button', { name: 'Разобрать бриф' }))

    expect(screen.getByDisplayValue('Заговорите до переезда')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Создать визуалы' }))

    expect(screen.getAllByRole('button', { name: /Выбрать визуал/ })).toHaveLength(5)
    await user.click(screen.getAllByRole('button', { name: /Выбрать визуал/ })[0])
    await user.click(screen.getByRole('button', { name: 'Перейти к шаблонам' }))

    expect(screen.getAllByTestId('template-option')).toHaveLength(20)
    await user.click(screen.getAllByRole('button', { name: /Выбрать шаблон/ })[0])
    await user.click(screen.getByRole('button', { name: 'Собрать черновик' }))

    expect(screen.getByText('Заговорите до переезда')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Подготовить Figma-пакет' }))
    await user.click(screen.getByRole('button', { name: 'Отправить на ревью' }))

    expect(screen.queryByText('1200×628')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Подтвердить ревью' }))
    await user.click(screen.getByRole('button', { name: 'Собрать финальный пакет' }))

    expect(screen.getByText('1080×1080')).toBeVisible()
    expect(screen.getByText('1080×1350')).toBeVisible()
    expect(screen.getByText('1080×1920')).toBeVisible()
    expect(screen.getByText('1200×628')).toBeVisible()
  })

  test('shows all twenty templates in the library view', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Шаблоны' }))
    expect(screen.getAllByTestId('template-card')).toHaveLength(20)
  })

  test('documents tokens and the shared banner content contract', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Дизайн-система' }))
    expect(screen.getByRole('heading', { name: 'Дизайн-система' })).toBeVisible()
    expect(screen.getByText('headline')).toBeVisible()
    expect(screen.getByText('1080×1920')).toBeVisible()
  })

  test('resets the viewport when global navigation changes the screen', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    window.scrollTo = scrollTo
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Шаблоны' }))
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' })
  })
})
