# Процесс команды

## Ownership

| Владелец | Обязательные артефакты |
| --- | --- |
| Ira | Wireflows, UI state/copy matrix, loading/empty/error states, responsive и accessibility QA |
| Vlad | Template directions, canonical slots, variables/tokens, versioned template manifest |
| Roman | State machine, API contracts, generation/safety pipeline, renderer, plugin/webhook handshake, E2E evidence |
| Вся команда | Golden path decision log, pilot dataset, demo rehearsal, go/no-go sign-off |

## Последовательность handoff

1. Команда фиксирует golden path и MVP boundaries.
2. Ira и Vlad фиксируют screen/state contract и template manifest contract.
3. Roman реализует vertical slice на deterministic demo adapters.
4. Команда проверяет review package в Figma; дизайнер отмечает frames статусом `Ready for Development`.
5. Маркетолог подтверждает exact snapshot; только после этого проверяется delivery package.

## Чеклист готовности

- [ ] State machine и API contracts согласованы.
- [ ] Для templates определены slots, safe zones, ratios и limits.
- [ ] Loading, empty, error и retry states описаны.
- [ ] Safety gate для AI outputs имеет rejection/retry rules.
- [ ] Renderer выдаёт PNG / MP4 / ZIP из approved snapshot.
- [ ] Figma review и Ready handshake проверены smoke test-ом.
- [ ] Responsive, accessibility и keyboard QA пройдены.
- [ ] Pilot dataset и demo rehearsal завершены.
- [ ] Команда приняла go / no-go решение.

## Критерий готовности

MVP готов к демонстрации, когда golden path проходит end-to-end на demo adapters, review gate зафиксирован в Figma-процессе, а delivery требует явного подтверждения exact snapshot.
