import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from '../App.jsx'
import { DocumentationScreen } from './DocumentationScreen.jsx'

describe('DocumentationScreen', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    window.localStorage.removeItem('lingu-studio-mvp-checklist-v1')
  })

  test('presents the Russian MVP documentation as a navigable product page', () => {
    render(<DocumentationScreen />)

    expect(screen.getByRole('heading', { name: 'Продукт, команда и Figma Bridge Plugin' })).toBeVisible()
    expect(screen.getByText('Рабочая документация MVP')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Как работает Lingu Studio' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Figma Bridge Plugin' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Что приложение делает' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Что приложение не делает' })).toBeVisible()

    const architecture = screen.getByRole('img', {
      name: 'Архитектура Lingu Studio: от брифа до готового пакета',
    })
    expect(architecture).toHaveAttribute('src', '/docs/lingu-studio-architecture.svg')
    expect(screen.queryByText('Показать Mermaid source')).not.toBeInTheDocument()

    const sectionNav = screen.getByRole('navigation', { name: 'Разделы документации' })
    expect(within(sectionNav).getByRole('link', { name: 'Как работает' })).toHaveAttribute('href', '#how-it-works')
    expect(within(sectionNav).getByRole('link', { name: 'Роли команды' })).toHaveAttribute('href', '#team')
    expect(within(sectionNav).getByRole('link', { name: 'Figma Bridge' })).toHaveAttribute('href', '#figma-bridge')
  })

  test('switches between marketer and designer journeys without leaving the page', async () => {
    const user = userEvent.setup()
    render(<DocumentationScreen />)

    const journey = screen.getByRole('region', { name: 'User journeys' })
    expect(within(journey).getByRole('tab', { name: 'Маркетолог' })).toHaveAttribute('aria-selected', 'true')
    expect(within(journey).getByText('Создать кампанию')).toBeVisible()

    await user.click(within(journey).getByRole('tab', { name: 'Дизайнер' }))

    expect(within(journey).getByRole('tab', { name: 'Дизайнер' })).toHaveAttribute('aria-selected', 'true')
    expect(within(journey).getByText('Получить назначение в Slack')).toBeVisible()
    expect(within(journey).queryByText('Создать кампанию')).not.toBeInTheDocument()
  })

  test('explains both plugin commands and the team handoff', () => {
    render(<DocumentationScreen />)

    expect(screen.getByRole('heading', { name: 'Publish Template' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Import Review Package' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Ira — UX/UI и design engineering' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Vlad — визуальная система и шаблоны' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Roman + Codex — приложение и интеграции' })).toBeVisible()
  })

  test('filters launch tasks by owner and persists completed task progress', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<DocumentationScreen />)

    const checklist = screen.getByRole('region', { name: 'MVP Launch Checklist' })
    expect(within(checklist).getByRole('heading', { name: 'MVP Launch Checklist' })).toBeVisible()
    expect(within(checklist).getByText(/0 из \d+ задач/)).toBeVisible()
    expect(within(checklist).getByText(/UI state\/copy matrix/)).toBeVisible()

    await user.click(within(checklist).getByRole('button', { name: 'Vlad' }))
    expect(within(checklist).getByText(/3–5 template directions/)).toBeVisible()
    expect(within(checklist).queryByText(/UI state\/copy matrix/)).not.toBeInTheDocument()

    await user.click(within(checklist).getByRole('button', { name: 'Все владельцы' }))
    const firstTask = within(checklist).getByRole('checkbox', { name: 'Отметить: Подготовить wireflows' })
    await user.click(firstTask)
    expect(within(checklist).getByText(/1 из \d+ задач/)).toBeVisible()

    unmount()
    render(<DocumentationScreen />)
    expect(screen.getByRole('checkbox', { name: 'Отметить: Подготовить wireflows' })).toBeChecked()
  })
})

describe('documentation route', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  test('opens from the main navigation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Documentation' }))

    expect(window.location.pathname).toBe('/docs')
    expect(screen.getByRole('heading', { name: 'Продукт, команда и Figma Bridge Plugin' })).toBeVisible()
  })
})
