# Рабочий процесс

## Golden path

```mermaid
flowchart LR
  A[01 Brief] --> B[02 Copy]
  B --> C[03 AI assets]
  C --> D[04 Templates]
  D --> E[05 Review package]
  E --> F[06 Figma review]
  F --> G{07 Approval}
  G --> H[08 Delivery]
  M[Маркетолог] -. brief, choices .-> A
  V[Vlad] -. template manifest .-> D
  S[Slack assignment] -.-> F
  W[Ready webhook] -. status .-> G
```

## Stages

| Stage | Input | Output | Gate |
| --- | --- | --- | --- |
| Brief | Свободный контекст кампании | Campaign record | Brief достаточен для старта |
| Copy | Brief | Headline, body, offer, CTA, prompts | Marketer выбирает или редактирует |
| AI assets | Visual prompt | Пять visual directions | Направление выбрано |
| Templates | Template manifest + выбранный visual | Banner compositions | Slots, ratios и limits валидны |
| Review package | Immutable composition snapshot | Пакет для дизайнера | Версия зафиксирована |
| Figma review | Review package | Edited frames + Ready status | Designer ставит `Ready for Development` |
| Approval | Ready snapshot | Explicit marketer approval | Exact snapshot подтверждён |
| Delivery | Approved snapshot | PNG / MP4 / ZIP | Только после approval |

## Переходы нельзя пропускать

Delivery не запускается из draft состояния. Любые изменения после создания review package требуют новой версии package и повторного review.
