# MVP Launch Checklist — Design Note

## Goal

Добавить в страницу `/docs` рабочий чеклист подготовки MVP к запуску с распределением задач между Ira, Vlad, Roman + Codex и всей командой.

## Решение

Чеклист будет интерактивным, но локальным: каждая задача имеет владельца, этап, артефакт и optional dependency; отметки сохраняются в `localStorage` браузера. Пользователь может отфильтровать список по владельцу или этапу, а верхний progress summary показывает общий прогресс и прогресс по ролям.

Это сознательно не kanban и не серверный task tracker: для MVP нужен быстрый proof of workflow без auth, collaboration conflicts, backend migration и внешней интеграции.

## Checklist content

- **Ira:** wireflows, UI state/copy matrix, empty/loading/error states, responsive/a11y QA.
- **Vlad:** 3–5 template directions, canonical slots, safe zones/limits, variables/tokens, published template manifest.
- **Roman + Codex:** state machine, campaign/copy/assets data contract, GenAI image/video jobs, safety gate, renderer/export, Figma/Slack handshake, end-to-end test.
- **Команда:** golden path review, approval SLA, pilot dataset, launch demo and go/no-go decision.

Stages:

1. `До implementation` — контракты и артефакты, без которых разработка будет переделывать работу.
2. `Parallel work` — задачи, которые Ira, Vlad и Roman могут выполнять независимо после согласования контрактов.
3. `Launch readiness` — проверка рабочего сценария и готовности пилота.

## Acceptance criteria

- Пользователь видит checklist section inside `/docs`.
- Фильтр `Все`, четыре владельца и три стадии изменяют отображаемые задачи.
- Checkbox меняет выполненность, обновляет overall progress и сохраняется после remount.
- У каждой задачи отображаются owner, stage, artifact и dependency/status hint.
- Checklist не требует backend и не изменяет существующие campaign workflow.

