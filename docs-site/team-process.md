# Процесс команды

## Распределение ответственности

| Владелец | Обязательные артефакты |
| --- | --- |
| Ira | Wireflows, UI state/copy matrix, loading/empty/error states, responsive и accessibility QA |
| Vlad | Template directions, canonical slots, variables/tokens, versioned template manifest |
| Roman | State machine, API contracts, generation/safety pipeline, renderer, plugin/webhook handshake, E2E evidence |
| Вся команда | Golden path decision log, pilot dataset, demo rehearsal, go/no-go sign-off |

## Расширенная таблица задач

Статус отражает объём MVP: `V1` — входит в текущий vertical slice, `V1 gate` — блокирует демонстрацию, `Later` — не делаем до подтверждения основного сценария.

| Задача | Владелец | Участники | Результат | Готово, когда | Зависимость | Статус |
| --- | --- | --- | --- | --- | --- | --- |
| Зафиксировать golden path и state machine | Ira | Roman, вся команда | Список состояний и разрешённых переходов | Для каждого перехода указаны actor, precondition и result | — | V1 gate |
| Описать screen/state/copy matrix | Ira | Roman | Контракт экранов, loading/empty/error/retry states | Все состояния покрыты wireflow и проверяемы тестом | State machine | V1 gate |
| Определить template directions и canonical slots | Vlad | Ira | Набор template directions, slots, safe zones и ratios | Для каждого template есть manifest и validation limits | Golden path | V1 gate |
| Собрать pilot dataset | Ira | Vlad, Roman | Реальные brief, copy, visual prompts и template fixtures | Dataset проходит golden path без ручной подмены данных | Template manifest | V1 gate |
| Реализовать campaign/copy/assets data contract | Roman | Ira, Vlad | Versioned payload для campaign, copy, assets и templates | Payload валидируется и отображает ошибки до запуска job | State machine, manifest | V1 |
| Реализовать deterministic demo adapters | Roman | — | Demo jobs для copy, image/video и template composition | Повторный запуск даёт одинаковые результаты и статусы | Data contract | V1 |
| Добавить generation safety gate | Roman | Ira | Moderation, rejection/retry rules и human selection | Unsafe output блокируется, retry объясняет причину | Demo adapters | V1 gate |
| Реализовать review package и renderer/export | Roman | Vlad | Immutable snapshot, PNG / MP4 / ZIP output | Export строится только из approved snapshot и имеет manifest | Data contract, templates | V1 gate |
| Проверить Figma review и Ready handshake | Vlad | Roman | Review package в Figma, Ready status и smoke test | Designer может отметить frames `Ready for Development`; событие идемпотентно | Review package | V1 gate |
| Настроить Slack assignment и handoff | Roman | Ira, вся команда | Назначение review и ссылка на package | Уведомление содержит owner, package version и deadline | Figma handshake | V1 |
| Провести responsive/accessibility/keyboard QA | Ira | Vlad, Roman | QA evidence по ключевым экранам | Нет блокирующих проблем на desktop и mobile viewport | Screen/state matrix | V1 gate |
| Провести demo rehearsal и go/no-go | Вся команда | Ira, Vlad, Roman | Decision log и список известных ограничений | Golden path проходит end-to-end, решение записано | Все V1 gates | V1 gate |

### Как читать таблицу

- Владелец отвечает за результат и обновляет эту страницу при изменении контракта.
- Участники нужны для согласования входов и проверки результата, но не заменяют владельца.
- Если зависимость не закрыта, задача не считается готовой даже при наличии частичной реализации.

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
