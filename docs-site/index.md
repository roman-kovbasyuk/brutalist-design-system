# Lingu Studio: технические документы

Это рабочая документация MVP. Здесь описаны только зафиксированные workflow, технические границы и процессы команды.

## Содержание

- [Workflow](./workflow) — путь от brief до delivery и обязательная точка review.
- [Technical architecture](./architecture) — модули приложения, состояние, сборка и границы интеграций.
- [Team process](./team-process) — владельцы артефактов, handoff-процесс и launch gates.

## V1 boundaries

- Приложение frontend-only и работает на локальных demo-данных.
- Copy, visual directions, templates, review package и delivery представлены детерминированными сценариями.
- Реальные provider jobs, Figma writes, Slack notifications, webhooks, billing и multi-org не входят в V1.
- Дизайнерский review остаётся обязательным human gate перед delivery.

## Source of truth

Изменения в workflow сначала фиксируются в этой документации и в соответствующих тестах. UI не должен обещать интеграцию, которой нет в текущем runtime.
