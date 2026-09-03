# Team process

## Who owns what

| Owner | Main responsibility |
| --- | --- |
| Ira | User flows, screen states, copy, responsive behavior, and accessibility checks |
| Vlad | Template direction, layout slots, variables, design tokens, and the template rules file |
| Roman | Workflow rules, data contracts, AI safety checks, file export, Figma/Slack connections, and end-to-end tests |
| Whole team | Shared decisions, sample campaign data, demo rehearsal, and the final go/no-go decision |

## Handoff sequence

1. The team agrees on the main workflow and the V1 limits.
2. Ira defines the screens and all important states: loading, empty, error, and retry.
3. Vlad defines the template rules: slots, safe areas, sizes, and limits.
4. Roman connects the workflow into one repeatable demo using local sample data.
5. The team reviews the package in Figma. The designer marks frames `Ready for Development`.
6. The marketer approves the exact version. Only then can the team prepare delivery files.

## Expanded task table

`V1` means the task is part of the current demo. `V1 gate` means the task blocks the demo. `Later` means it is intentionally outside the first release.

| Task | Owner | Helpers | Deliverable | Done when | Depends on | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| Agree on the main workflow and status changes | Ira | Roman, whole team | One list of steps and allowed status changes | Every change names the person who can make it and the required condition | — | V1 gate |
| Define screen and content states | Ira | Roman | Screen map and state table | Loading, empty, error, and retry behavior is clear for every screen | Workflow | V1 gate |
| Define template directions and layout slots | Vlad | Ira | Template examples and rules | Every template has slots, safe areas, sizes, and limits | Workflow | V1 gate |
| Prepare sample campaign data | Ira | Vlad, Roman | Briefs, copy, image prompts, and template examples | The sample data can complete the main workflow without manual replacement | Template rules | V1 gate |
| Define the campaign data format | Roman | Ira, Vlad | Shared format for campaign, copy, images, and templates | The app can validate the format and show useful errors | Workflow, template rules | V1 |
| Build repeatable demo actions | Roman | — | Predictable demo actions for copy, images, and compositions | Repeating the same action gives the same result and status | Data format | V1 |
| Add AI safety checks | Roman | Ira | Content checks, rejection reasons, and retry rules | Unsafe content is blocked and the user knows what to do next | Demo actions | V1 gate |
| Build the review package and exports | Roman | Vlad | Locked review version and PNG / MP4 / ZIP files | Exports can only use the approved version | Data format, templates | V1 gate |
| Test the Figma review handoff | Vlad | Roman | Review file, Ready status, and a short test | A designer can mark frames ready and the status is recorded once | Review package | V1 gate |
| Set up Slack review assignment | Roman | Ira, whole team | Review message with owner, version, and deadline | The right person receives a usable review link | Figma handoff | V1 |
| Run responsive and accessibility checks | Ira | Vlad, Roman | QA notes for desktop and mobile | No blocking issue remains in the main screens | Screen states | V1 gate |
| Rehearse the demo and decide go/no-go | Whole team | Ira, Vlad, Roman | Decision log and known-limitations list | The main workflow works from start to finish and the decision is recorded | All V1 gates | V1 gate |

### How to use this table

- The owner is accountable for the result and updates this page when the task changes.
- Helpers review inputs and outputs; they do not replace the owner.
- A task is not done while one of its dependencies is still open.

## Definition of ready

The MVP is ready for a demo when the main workflow works from start to finish with sample data, the Figma review is recorded, and delivery requires approval of the exact version.
