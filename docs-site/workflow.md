# Workflow

## The happy path

The happy path is the one complete route a campaign must follow. A step cannot be skipped.

```mermaid
flowchart LR
  A[1. Brief] --> B[2. Copy]
  B --> C[3. Image ideas]
  C --> D[4. Templates]
  D --> E[5. Review file]
  E --> F[6. Figma review]
  F --> G{7. Approval}
  G --> H[8. Delivery]
  M[Marketer] -. sends brief and choices .-> A
  V[Vlad] -. provides template rules .-> D
  S[Slack assignment] -. sends review task .-> F
  W[Ready webhook] -. sends status .-> G
```

## Steps

| Step | What goes in | What comes out | Who confirms it |
| --- | --- | --- | --- |
| Brief | Campaign context | Campaign record | Marketer confirms the brief is clear enough to start |
| Copy | Brief | Headline, body, offer, call to action, prompts | Marketer selects or edits the copy |
| Image ideas | Visual prompt | Five visual directions | Marketer selects one direction |
| Templates | Template rules + selected direction | Banner compositions | The design fits the allowed slots, ratios, and limits |
| Review file | Locked composition snapshot | Package for the designer | Version is recorded |
| Figma review | Review file | Edited frames + `Ready for Development` status | Designer marks the frames ready |
| Approval | Ready snapshot | Marketer approval | Marketer approves the exact version |
| Delivery | Approved snapshot | PNG / MP4 / ZIP | Export is allowed only after approval |

## Do not skip a step

Delivery cannot start from a draft. Any change after the review file is created needs a new version and another review.
