# Observatory

A local dashboard of project work with a Kanban board and a compact monospace task table. Backlog cards are user-authored plans; launched work retains the existing three reporting statuses: **in progress**, **needs attention**, and **ready**. The board refreshes every five seconds and projects ready work into Done. No build step or provider credentials are needed.

## Kanban planning and launch

The default Board view has Backlog, Started, and Done columns with no project-part lanes. Tasks can stay ungrouped. A single + Add lane control at the bottom of the board appends a new lane; the toolbar has no lane-creation action. Existing lanes remain editable by clicking their names. The inline + Add task action in Backlog saves a title, description, optional lane, and original attachments. Project context supplies shared goals and references to every new launch. Backlog cards can be edited and moved into or out of an existing lane using their form; saving a plan never starts an agent. Untouched legacy default lanes are retired and their cards become ungrouped; renamed lanes or lanes with context are preserved.

Drag a card into Started in the same lane to launch it; there is no separate start button. Observatory creates a new Codex desktop task in this project checkout, inheriting the user's configured model settings. The initial prompt contains the full description (including legacy task context), shared project/lane context, repository path, instructions to read README/AGENTS, the exact existing task record ID, and commands using an absolute TASKS_FILE to read the current brief and original attachment paths. The agent reuses that record and reports ready only after verification; the card then appears in Done automatically. Needs attention remains in Started. An idle or completed turn alone does not mean Done.

Start the server **from a Codex task terminal** with the exact project saved in the desktop app:

```sh
npm --prefix observatory start
```

The startup script uses CODEX_MCP_NODE_PATH when supplied by Codex. The installed macOS desktop authorizes its bundled runtime for the app-tools socket; an ordinary system Node process may be rejected. The bridge also needs inherited CODEX_APP_TOOLS_PIPE_PATH and CODEX_THREAD_ID. None of these values is persisted by the board. Outside that environment the board remains usable for planning, and launch failures leave the backlog intact. Restart from a fresh Codex task terminal after a desktop restart if the old pipe becomes unavailable. This adapter uses the installed app-tools protocol and may need revalidation after desktop updates.

Repeated drops are guarded by a persisted launch reservation. A timeout or interrupted server leaves creation unconfirmed and prevents automatic resubmission. Check Codex, then use Link task with the existing task's ID to recover tracking; the server verifies its checkout before binding it. Open in Codex links lead to the associated conversation. Once a card has started, send further instructions in that conversation (or through Task table's message composer).

The board is stored beside the task file as `<TASKS_FILE>.board.json` (by default `data/tasks.json.board.json`) with the same crash-safe locking as tasks. Back up both files. Card specifications and context are local data and are included in the Codex prompt when you start them; do not put credentials or sensitive content in them.

Board endpoints: `GET /api/board`, `PATCH /api/board` for shared context, `POST /api/board/lanes`, `PATCH /api/board/lanes/<id>`, `POST /api/board/cards`, `PATCH /api/board/cards/<id>`, `POST /api/board/cards/<id>/start`, and `POST /api/board/cards/<id>/link` with `{ "threadId": "..." }`. Cards accept `title`, `specification`, `context`, `laneId`, and optional `expectedUpdatedAt`; lanes accept `name` and `context`. Existing task APIs and CLI statuses are unchanged.

Each named lane has a close button. With multiple named lanes, a confirmation dialog asks which remaining lane (or Default) should receive its cards. With only one named lane plus the default row, closing it moves all cards to Default immediately without confirmation. Removing a lane preserves every card, its status, and its Codex binding, but removes the lane’s name and shared context. The default row cannot be removed. `DELETE /api/board/lanes/<id>` accepts `{ "targetLaneId": "destination-id" }`, or an empty destination for Default; omitting the destination is allowed only for the last named lane.

## Start

Quick status buttons show live counts for all tasks, in progress, needs attention, and ready; clicking one filters the table. Status appears first, with a blue slow pulse for in progress, an amber double blink for needs attention, and a steady green dot for ready. Indicators describe reported task status, not live agent connectivity. Hovering a task swaps its title for a two-line description preview inside a fixed-height cell, without moving other rows. Click for the full description. Keyboard focus shows the preview instantly; reduced-motion settings remove movement and keep dots steady.

Drag the slim divider at the right edge of any table heading to resize that column. Arrow keys on a focused divider adjust it in 16px steps. Widths are kept in this browser and each column has a minimum width; narrow screens scroll horizontally instead of crushing the table.

Search filters instantly across task names, descriptions, updates, screens, sections, statuses, and models. It ignores case and matches all entered words. Search works together with the selected status; the status counts reflect matching tasks. Clear it with the × button or Escape. On small screens the search field moves below the status buttons.

Dates use the browser's local calendar day and a 24-hour clock: today's timestamps show `11:32`; other dates show `7 Sep 11:23`. The table refreshes this format after midnight even when no tasks change. Hovering an Updated cell still shows the full creation and update timestamps.

Requires Node.js 20 or newer and Python 3 on macOS or Linux. Python's standard
library supplies crash-released file locks and the read-only desktop catalog
query; no Python packages are installed. From the project root:

```sh
npm --prefix observatory start
```

Open http://127.0.0.1:6001. Use `PORT=6002 npm --prefix observatory start` for another port. The server binds to the local machine only. Stop with Ctrl+C; task data persists.

## Agent input / output

### Project-local task access

Each installation belongs to one project. Agents and the board share local files
through the same storage code; there is no separate agent service or database to
run. Use the CLI instead of editing JSON directly. The original reporting commands
below remain compatible; the `task` group also includes unstarted backlog cards.

```sh
node observatory/cli.mjs task list
node observatory/cli.mjs task lanes
node observatory/cli.mjs task get <task-id>
node observatory/cli.mjs task brief <task-id>
node observatory/cli.mjs task create --input task.json
node observatory/cli.mjs task update <task-id> --input edit.json --revision <revision>
node observatory/cli.mjs task move <task-id> <lane-id-or-default> --revision <revision>
node observatory/cli.mjs task begin <task-id> --agent 'Chat name' --revision <revision>
node observatory/cli.mjs task report <task-id> --input report.json --revision <revision>
node observatory/cli.mjs task attach <task-id> ./reference.pdf --type application/pdf
node observatory/cli.mjs task file <task-id> <file-id>
node observatory/cli.mjs task file <task-id> <file-id> --output ./reference-copy.pdf
```

Create input: `{"title":"Add search","description":"Search tasks by title and verify the empty state.","laneId":""}`.
Update input: `{"description":"Revised description and verification criteria."}`;
only title and description are editable with this command. Report input:
`{"status":"ready","note":"Implemented and verified with the focused tests."}`.
Reports also accept agent, model, effort and category. Use `--input -` to read JSON
from stdin. Copy the opaque revision from the latest get/update result; after a
conflict, re-read and reconcile your edit instead of replaying stale data.

`brief` includes description, shared project context, lane context, and attachment
metadata with absolute original-file paths. Read those files with your agent's
normal file tools. Original-file retrieval verifies the stored SHA-256 hash.
Exports refuse to overwrite existing files. Legacy inline text is preserved;
legacy binary attachments without stored bytes are marked `missing-original`
and must be reattached. Legacy task context is included in the description and
folded into it on the next edit; no bulk data migration is required.

`begin` runs work in the current agent: it never creates a Codex chat. A persisted
reservation excludes a simultaneous dashboard launch. If setup is interrupted,
re-read and repeat begin with the same agent name. This is recovery bookkeeping,
not a lease or authentication boundary. `move` changes project-part lanes only,
preserving execution state and bindings; Pulse-only tasks are added to the board
with their existing IDs. Ready requires a verification note and projects to Done.
Existing message/request-scoped tasks still require their original scoped report
commands; task report does not bypass those safeguards.

The stores remain `<TASKS_FILE>`, `<TASKS_FILE>.board.json`, and
`<TASKS_FILE>.attachments/` (originals and metadata). Defaults are relative to the
installation, even when invoking the CLI from elsewhere. Shared worktrees must
use the same absolute TASKS_FILE. Back up the whole data directory, including the
request ledger. Content edits and lane moves are separate locked operations,
not one cross-file transaction. This is trusted local tooling, not a sandbox for
agents with filesystem access; do not store credentials in descriptions or files.

Browser uploads use `POST /api/board/cards/<id>/attachments?name=<encoded-name>`
with the raw file body and Content-Type. Downloads use
`GET /api/board/cards/<id>/attachments/<file-id>`. These are local dashboard routes,
not an agent API. Limits are 20 MiB per original, 10 originals and 100 MiB per task.
Identical filename/type/content retries reuse the stored original. Downloads are
attachment-only with nosniff. Failed uploads leave the saved card and pending
files available for retry. Removing a backlog card does not erase original blobs;
unreferenced files are retained, including after interrupted publication.

### Existing reporting and messages

```sh
node observatory/cli.mjs list
node observatory/cli.mjs locations
node observatory/cli.mjs add 'Improve the navigation' 'Make the current page easier to identify.'
node observatory/cli.mjs get <id>
node observatory/cli.mjs update <id> 'in progress' 'Navigation updated; checking keyboard interaction.'
node observatory/cli.mjs update <id> 'needs attention' 'Need a decision about the mobile navigation.'
node observatory/cli.mjs update <id> 'ready' 'Implemented and checked at desktop and mobile widths.'
node observatory/cli.mjs inbox 'Orchestrator'
node observatory/cli.mjs claim <task-id> <message-id>
node observatory/cli.mjs ack <task-id> <message-id>
node observatory/cli.mjs start <task-id> <message-id> 'Resuming work from user feedback.'
node observatory/cli.mjs retry <task-id> <message-id>
node observatory/cli.mjs bind <task-id> <project-id> <provider> <conversation-id>
```

Use the ID returned by `add`. CLI output is JSON; errors go to stderr with nonzero exit status. Agents can use this interface while the dashboard is closed. The root `AGENTS.md` defines when they must pull and push tasks. The CLI is instruction-based reporting; when the server runs, the desktop connector also captures request receipts and observes runtime state as described below. Verification notes remain the reporting agent's responsibility. The dashboard shows store availability and Codex connection freshness separately.

Append an optional model name, reasoning effort, project chat/task name, and category to `add` or `update`, for example `node observatory/cli.mjs add 'Task title' 'Description' 'gpt-5.6-terra' 'medium' 'Orchestrator' 'ui polishing'`. Categories are `bug`, `ui polishing`, or `specification`, shown in a 20px icon column after Status. When an agent omits the category on a new task, Observatory infers one from its title and description; an explicit category takes precedence. The status hover card shows the **Chat** that owns the work separately from the **Model** that last reported it. The table renders only known runtime IDs, using compact labels such as `Terra · Medium`, `Luna · High`, and `Astra · Extra High`; a generic legacy model is left blank rather than guessed. Common effort values are `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`; unknown values remain readable. Model names, effort, chat names, and categories are reported by agents, not automatically detected. Omitting any value on update preserves it; an empty string clears it. Existing task files without these fields remain compatible.

The Task details popup includes a local message composer. CLI creation inside Codex binds the task to the current conversation; other creation paths default to a local CLI binding. Agents can register a verified provider binding with `bind`. Messages are stored with the task and start in `queued`. The desktop connector delivers Codex-bound messages to their owning conversation. CLI-only agents pull messages with `inbox`, then `claim`, `ack`, and `start`. Only `start` changes the task to `in progress`. Failed messages may be retried with `retry`; idempotency keys prevent duplicate submissions and active leases prevent competing claims. The task list endpoint omits message bodies; message history is loaded only for the selected task. Message text is limited to 4,000 characters and should never contain secrets.

Task details retain the native modal's focus containment and Escape behavior.
The heading and bottom composer remain in place while details and message history
share one scrolling region. Its scrollbar is 3px in WebKit and inset 15px from
the shell's original right edge. The composer uses the existing field and action
styles, with only the requested placeholder and Send button as static copy;
delivery/error feedback is announced when relevant. Its height is bounded so
resizing the input cannot push Send outside the modal.

## HTTP interface

The table has separate **Screen** and **Section** columns. Agents identify these from the request and inspect the affected UI; users do not need to enter the location or construct its link. Screen is stored as `page` for compatibility with existing task files and API callers. The task details view shows the description directly beneath the task name, followed by the remaining stored fields, without turning them into an edit form. Use the inline **Edit** control beside the task name to change only its title; press **Enter** to save or **Escape** to cancel. Status, descriptions, notes, chat, model, effort, and location remain agent/API-owned.

`node observatory/cli.mjs locations` lists verified destinations from `observatory/locations.json`. For example, `node observatory/cli.mjs location <id> 'Observatory' 'Task table'` automatically records `#task-table`. Same-screen anchors intentionally omit the leading slash so the dashboard behaves correctly when its HTML is opened as a local `file://` preview as well as through the server. POST and PATCH also resolve registered links when `page` and `section` are supplied without an `anchor`. Changing a location clears its previous link if no destination is known. An explicit link takes precedence, and an explicit empty string clears it.

For new UI areas, the agent finds the real route and section ID, adds a stable ID to the section being changed when needed, verifies navigation, and adds the destination to the catalog. It must use the host application's full URL when that app runs separately from Observatory; relative links point at Observatory. If no reliable link exists, the agent retains the known labels and explains the limitation in the task note. This is agent reasoning guided by `AGENTS.md` plus automatic lookup of verified destinations, not keyword guessing from task titles.

The section label is a clickable link with an arrow; links to the current screen stay in the same tab, focus the section, and highlight its destination. Other screens open in a new tab. Both POST and PATCH accept `page`, `section`, and `anchor` text (200, 200, and 2,000 characters respectively). Non-UI work can leave location blank. The older `section <id> 'Page / Section'` command remains available for compatibility.

While the server runs:

- `GET /api/tasks` returns the task array.
- `GET /api/locations` returns the verified screen/section destination catalog.
- `POST /api/tasks` accepts `{ "title": "...", "description": "...", "model": "...", "effort": "...", "agent": "...", "category": "ui polishing", "page": "...", "section": "...", "anchor": "..." }` and returns the created task (201).
- `PATCH /api/tasks/<id>` accepts any of `title`, `description`, `status`, `note`, `model`, `effort`, `agent`, `category`, `page`, `section`, `anchor` and returns the updated task. Optionally send `expectedUpdatedAt` from a previous read to reject stale edits (409). Anchor links are rendered only for `http:`, `https:`, relative, or fragment URLs; unsafe schemes are ignored by the UI.

Send `Content-Type: application/json`. Status values use spaces and lower case exactly as listed above. Dates and IDs are assigned by the store. Validation errors return 400, missing tasks 404, and lock timeouts 503. Unknown fields and extra statuses are rejected. No deletion endpoint is included in the MVP.

## Use in another project

Copy the `observatory` folder, excluding `data`, into the other project. Append the task-observability instructions from this project's root `AGENTS.md` to the other project's `AGENTS.md`, preserving its existing instructions. Run the same command. An empty store is created on the first task write. Each copy has its own task data.

The bundled `locations.json` entries point to sections within Observatory itself. Add the other project's actual screen URLs and verified section IDs as its agents encounter them. No installation or external service is needed for location lookup. A missing catalog is treated as empty; malformed or duplicate entries are reported instead of choosing an ambiguous destination.

To share one store between checkouts/worktrees, set `TASKS_FILE` to the same **absolute** path for every CLI and server process. Keep that file on a local filesystem. Otherwise each checkout is independent. You can also copy `data/tasks.json` to migrate existing tasks while all writers are stopped.

## Storage and recovery

Tasks live in `observatory/data/tasks.json` (ignored by Git); back up that file and
its `.requests.json` ledger if the records matter. Writes use OS advisory locks
and atomic file replacement so simultaneous local agents do not overwrite the
whole table. A Python helper owns the lock and performs the final replacement,
including file and directory flushes. Killing the Node writer closes its input;
an incomplete submission cannot commit, and the helper releases the lock on exit.
Killing the helper itself cannot leave a lock blocking later writers. The empty
`.write-lock` files remain on disk and must not be removed while writers run.
The browser rejects stale title saves. Notes contain the latest update, not a
history of every update. Windows file-lock support has not been implemented.

When upgrading from the earlier directory-lock version, stop all old Observatory
servers and CLI writers first. If an old `.lock` directory remains, remove that
empty directory with `rmdir` only after confirming its writer is stopped. The new
helper refuses to compete with a legacy lock. This migration also applies to
the request ledger and custom TASKS_FILE paths. The new OS locks need no stale-PID
or elapsed-time deletion. Malformed data is reported without replacing it.

## Verify

To check CLI/API integration and project isolation, run `npm --prefix observatory run harness` from the project root. See [HARNESS.md](HARNESS.md) for isolated fresh-agent discovery and conversation-handoff exercises, acceptance checks, and known security gaps. These exercises use synthetic data, never the live task history.

```sh
node --test observatory/test/*.test.mjs
```

Tests use temporary stores; they do not alter your dashboard records.

## Codex desktop integration

The server now connects to the running desktop task owner through its local IPC
socket. The earlier shared-daemon CLI route has been replaced. No extra Codex
agent process is launched. This adapter uses the installed desktop protocol
(snapshot version 11, owner discovery version 1, start version 2, steer version 1).
It is a version-specific integration, not a public compatibility guarantee.
Socket ownership and project identity are checked before delivery; unsupported
protocol versions fail closed.

CLI `add` binds new tasks to `CODEX_THREAD_ID` when available. Legacy tasks require
an explicitly verified binding with `bind`; titles are not routing keys. The
server attempts delivery immediately after persisting a comment, steers an active
owning run, or requests a turn in an idle owning task. The original execution
settings remain inherited. Five-second scans recover work after disconnection.
Comment dispatch runs independently of status discovery, so messages arriving
during a slow scan do not wait for it to finish.
An unavailable owner discovered before submission leaves the comment queued for
automatic retry. A definite project mismatch is reported as not sent. Failed
messages expose Retry in their history; it persists the retry and wakes delivery
immediately. An uncertain submission never exposes a blind retry action.

Queue receipts retain the Codex turn ID. The receiving agent acknowledges and
starts the message through the CLI. Delivery alone does not imply processing.
Ambiguous delivery remains unconfirmed and blocks further automatic sends to
that conversation. Replayed accepted-message history confirms it only when the
exact client message ID and destination match; it never blindly resends it.
If that evidence is absent, inspect the target before retrying. Runtime snapshots and
patches update associated work when it waits for input/approval or stops without
a verified outcome. Idle is never automatically mapped to ready. Status is
reconciled against each task's recorded turn, including completed turns in history
when another turn is active. Newly active work cannot attach to a previous
completed turn while new turn details are arriving. Completion is reported with `report <task-id> <message-id> <status> <note>`. Once a message has
started, unscoped status writes are rejected. Reports from an older processing
generation cannot finish newer work. A ready report remains pending until the
matching Codex turn completes; turn completion alone never supplies verification.

Verified live on 7 September 2026: exact current-task owner discovery, active
steering, HTTP submission through the persisted outbox to that same desktop task,
and agent acknowledgement/start in an isolated fixture. The source includes
synthetic tests for these transport and status rules.

The service discovers user conversations in this project through a read-only
query of the installed Codex catalog, excluding internal guardian/subagent tasks.
Git-registered worktrees are verified through `git worktree list --porcelain -z`
and included in discovery and destination checks. Unregistered directories with
the same name remain excluded. Receipts retain a canonical project identity and
separate source checkout, so a conversation moving between verified worktrees
does not create another receipt. Sharing task records still requires the same
absolute TASKS_FILE across writers; discovery does not copy another checkout's
task database.
Their user-message IDs are captured in a separate durable request ledger. It
stores source identity, chat title and task links, never message bodies. Exact
CLI mutation output and Observatory message IDs can establish automatic links.
Unassigned receipts remain visible in the dashboard. Agents use `requests`,
`resolve-request`, and `resolve-conversation` to resolve only their own receipts
from the actual conversation context. A receipt is not authorization to execute
outstanding work. The connector requests complete history once per owner and
connection, waits for its acknowledged revision, and checks the runtime's
`isComplete` flag. Reconnection repeats this repair. Older snapshots cannot
replace newer revisions, and a replacement owner starts with an empty cache.
Snapshots already marked complete do not need another hydration request. Frames
are collected without repeated whole-frame copies and bounded at 128 MiB; larger
histories produce an explicit connection failure. A real 77 MB, 103-turn history
and a 33 MiB synthetic socket fixture have been checked.
Turn-wide CLI attribution applies only to a turn with one source request; multiple
requests require exact message links or explicit resolution. Replay can repair
automatic links while preserving explicit resolutions.

The dashboard reports connection state, scan time, reachable conversation count,
and unresolved requests. Discovery needs Python 3 and the installed state_5.sqlite
schema; if discovery fails, already-bound tasks remain monitored and the failure
is displayed.

The receipt fixture finalized only after its matching live Codex run completed.
Live read-only verification also confirmed complete-history hydration and replay
after disconnecting and reconnecting this conversation. The attempted idle proof
used steering because goal continuation started first; it is not an idle-start pass.

Remaining work before full service acceptance: live idle-task resumption,
crash-point recovery verification, historical request matching,
precise automatic mapping and legacy-binding migration. Existing unit and harness passes do
not establish these remaining requirements. A Codex desktop update may require
adapter revalidation. No credentials or raw snapshots are stored by the adapter.
See [CONNECTOR-ACCEPTANCE.md](CONNECTOR-ACCEPTANCE.md) for the requirement-by-requirement
audit, including automatic creation and worktree coverage that remain incomplete.

A controlled idle-resumption check is available with
`node observatory/live-idle-proof.mjs --current-thread` inside the Codex task being
tested. It waits for that task to become idle, submits one fixture-only comment,
and checks its message-scoped result after execution completes. It never creates
or interrupts a Codex task. Outputs stay under `data/harness/idle-proof-*`.
For a different existing task, first obtain explicit authorization, then use
`--thread <conversation-id>`. Add `--prepare-only` to write a reviewable receipt
preview and fixture without connecting to or messaging Codex.

### Structured request accounting

`node observatory/cli.mjs classify-request <receipt-id> <decision-file.json>`
applies a sanitized semantic decision from a JSON file. With `CODEX_THREAD_ID`
present, only the receipt's owning conversation may classify it. A local operator
without that variable can perform explicit accounting, as with receipt resolution.

For ordinary conversation use `{"kind":"conversation"}`. For work use
`{"kind":"work","taskIds":[],"newTasks":[{"title":"Requested outcome","description":"Sanitized verification criteria","category":"bug"}]}`.
Existing task IDs and new tasks may be combined (one to ten total). New tasks
inherit the source conversation binding and begin as `needs attention` until
processing is confirmed. Replaying the same decision repairs interrupted
accounting without creating duplicate tasks; conflicting decisions are rejected.
This command performs bookkeeping only. Automatic semantic intake is not yet
connected, and classification does not authorize execution of historical work.

After classification links a general source request, its owning agent can run
`node observatory/cli.mjs start-request <task-id> <receipt-id>` and report milestones
with `node observatory/cli.mjs report-request <task-id> <receipt-id> '<status>' '<note>'`.
Starting records the receipt's exact turn and a new work generation. Repeating
that start is idempotent; replaying a superseded started receipt is rejected.
Once started this way, ordinary status updates must use the receipt-scoped report.
A ready report remains pending until the connector observes the matching turn
completed. A newer request or task message invalidates the previous pending result.
Legacy tasks that have not adopted this contract still allow unscoped updates;
the general-request migration and automatic intake remain incomplete.

The adapter accepts an optional `classify({receipt, source, tasks})` callback.
After saving source receipts and applying runtime observations, it passes each
unassigned receipt and its exact transient source item to that callback. Returning
a structured decision applies the accounting operation; returning no decision or
throwing leaves the receipt unresolved for a later scan. Resolved receipts are
not classified again on replay. Source items are not written to the request ledger.
No classifier is configured by the default server yet: this extension point alone
does not provide automatic semantic intake in the running application.

Classification decisions are persisted after validation and before task creation.
If task creation succeeds but receipt finalization is interrupted, intake resumes
that saved decision even when source capture has already linked the task. Recovery
does not require the source body or another semantic decision, and does not create
another task. These saved decisions contain the same sanitized task fields accepted
by classification; they do not provide automatic secret filtering.

### Grouping rapid fixes

New Codex-bound bug and UI-polishing records from the same project and conversation
share a task when received within 60 seconds of the first fix. The window does not
slide forward. The original title remains recognizable with an added fix count;
the description lists each title and requested outcome. CLI/API creation and
source-receipt accounting share this behavior. New fixes invalidate a pending
completion so an earlier result cannot finish the enlarged task. Specification
requests and different conversations stay separate. Historical records created
before this feature are not merged. Source accounting uses the exposed source
receipt timestamp; direct CLI/API additions use their receipt time at the store.

### Recovery of stale desktop turn status

If a desktop snapshot leaves a verified result pending, the connector checks the
exact conversation and turn in the catalog-owned local Codex rollout. Only an
explicit `task_complete` event can finalize a matching pending verified result;
`turn_aborted` retains an interrupted outcome. The reader validates session and
project identity and returns only terminal metadata, without storing log bodies.
Incomplete lines, final assistant text, and elapsed time do not prove completion.
Work generation and conversation checks reject delayed recovery after reassignment.
This fallback depends on the installed Codex catalog and rollout format.
