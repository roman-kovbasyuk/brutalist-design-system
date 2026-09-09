# Task Observatory integration harness

This harness checks the existing local MVP before defining a distributable package. It has two layers: deterministic CLI/API checks and a fresh-agent discovery/handoff exercise. A passing scripted test does not prove an agent follows instructions; a successful agent exercise does not establish compatibility with every IDE or model.

See [HARNESS-RESULTS.md](HARNESS-RESULTS.md) for the observed first run and its limits.

## Automated checks

From the project root:

```sh
npm --prefix observatory run harness
```

This runs the existing test suite, then creates a disposable project from an explicit list of source files. It never copies the live task database. The fixture server binds to loopback on a random available port and stops after the checks. The live dashboard remains available.

Checks cover offline CLI usage, process-to-process task handoff, all three statuses, model/effort preservation, location lookup and static target IDs, CLI/API consistency, cross-origin write rejection, unknown-field rejection, and Git exclusion. Static ID checks do not replace browser verification of visibility or dynamic routing.

Reports and synthetic task data stay under the ignored `observatory/data/harness/run-*` directories. Each run gets its own directory. Reports contain check names and known gaps, not environment values or real credentials. Runs are retained for inspection; remove a specific run only when its agents and servers have stopped.

`PASS` means a functional assertion succeeded. `GAP` identifies an unmet product requirement; it does not fail the functional suite or imply publication readiness. Assertion failures return nonzero. The current security probe uses the literal synthetic string `api_key=SYNTHETIC_NOT_A_SECRET`. Never substitute a real credential.

## Fresh-agent discovery

Prepare a separate fixture:

```sh
node observatory/harness.mjs prepare
```

The command prints an absolute run directory. Open that directory as the project in a new conversation or a different agent environment. Give it only this bootstrap prompt (substitute the printed path):

> Work only in this disposable project: RUN_DIRECTORY. Read its AGENTS.md and ASSIGNMENT.md and complete the assignment. Use this directory as your working directory. Do not access parent project files, set TASKS_FILE overrides, change application source or project instructions, use external services, or use actual credentials. Report what you checked and any instruction-discovery issues.

The assignment is a non-UI audit of startup, build requirements, credential requirements, and persistence. It intentionally does not teach task commands: the agent must discover those in the project guidance. The copied CLI records command names, task IDs, status transitions, and timestamps in a fixture-only trace. It never records command text, task descriptions, notes, environment values, or model prompts. This wrapper exists only in the fixture; production CLI behavior is unchanged.

Check its result:

```sh
node observatory/harness.mjs verify RUN_DIRECTORY
```

Acceptance: the first task command is `list`; exactly one task was created; the task ends `ready` with a verification note; and non-UI work does not invent Screen/Section values. Review the agent response and tool evidence too: CLI traces cannot prove that claims in a note are true or that instructions were automatically loaded by an IDE.

## Handoff to another conversation

Use a second fresh conversation in the same fixture with this prompt:

> Work only in RUN_DIRECTORY and read its project guidance. Continue the existing startup audit: independently verify the documented launch procedure against the executable, and confirm the existing task data persists when a dashboard process is started and stopped on a random loopback port. Report your findings. Use the fixture working directory, no TASKS_FILE override, no parent-project access, no source or instruction changes, no external services, and no actual credentials.

Then run:

```sh
node observatory/harness.mjs verify-handoff RUN_DIRECTORY
```

Acceptance additionally requires a second completed cycle on the same task, with `in progress` between completions. The task count must still be one. Use separate conversations to test continuity; giving the second agent the first conversation transcript would weaken the test.

For a different IDE, first test whether it discovers AGENTS.md automatically. If it does not, use the explicit bootstrap prompt above and record that an adapter is needed. Any agent able to read the guide and execute the CLI can participate. Agents without local command access would need an appropriately secured API integration; this harness does not provide or test remote access.

## Current limits to carry into the specification

- Free-text descriptions and notes can contain sensitive data. The synthetic probe makes this gap visible; there is no reliable universal secret detector in the MVP.
- Shell history and process arguments can expose text passed to the CLI. Submit sanitized task summaries only.
- Task notes hold the latest update, not a durable event history. The harness trace is diagnostic instrumentation, not a shipped audit trail.
- A shared checkout discovers one store by location. Separate worktrees or copies have separate stores unless explicitly configured with the same absolute TASKS_FILE path.
- Native instruction discovery varies by agent environment. A no-history subagent with an explicit bootstrap tests guide comprehension, not automatic IDE loading or universal compatibility.
- The local HTTP API is not a multi-user authorization boundary. Remote distribution needs its own design and tests.

No repository creation, package publication, or deployment is performed by this harness.
