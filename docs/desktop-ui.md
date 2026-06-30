# Desktop UI Guide

The desktop app makes Artificial Orchestrator usable without remembering CLI commands. It is an Electron shell over the same project registry, provider config, organization presets, orchestration engine, and durable run files used by the CLI.

Run it from the repository:

```powershell
npm run desktop
```

## Mental Model

Artificial Orchestrator does not replace the CLI engine. The desktop app is a control panel for the engine:

- Projects tell the app which workspace to run against.
- Goals tell the agents what outcome to pursue.
- Providers and organizations decide which AI agents run and in what order.
- Permissions decide whether a run may edit files.
- Durable files record what happened so you can inspect, resume manually, or debug blocked runs.

The GUI should never expose provider secrets, bypass auth, bypass quota, or silently perform destructive workspace actions.

## Main Screens

### Session Page

The session page is the fastest path for daily use. It has a left session rail and a central chat-style workspace.

Use it to:

- Start a new session with `Ctrl+N`.
- Search and load recent sessions.
- Enter a goal in the composer and start a run.
- Watch agent messages as they appear.
- See the selected run's phase, project, team, blockers, latest handoff, and durable file buttons.

The session page is intentionally compact. When you need to change projects, providers, permissions, or the full agent roster, switch to the Hierarchy page.

### Hierarchy Page

The hierarchy page is the full operator view. It contains:

- Project list and add-project form.
- Run launcher.
- Setup checklist.
- Provider or organization selector.
- Optional custom agent roster.
- Permission controls.
- Organization map.
- Live monitor.
- Agent chat monitor.
- Recovery Center.
- Recent runs and durable file links.

Use this page when a run needs setup, debugging, or more explicit control.

## Project Workflow

Every run should have a clear project. A project is a named local workspace path.

In the desktop app:

1. Open the Hierarchy page.
2. Add a project name and path, or use Browse.
3. Select the project in the project list.
4. Confirm the active project label shows the expected name and path.

The app fails early if the workspace path does not exist. It does not create a new empty folder from a mistyped path.

Equivalent CLI:

```powershell
ao project add ims --path C:\Users\kanta\source\repos\ims-th-solution --use
ao project list
ao project use ims
```

## Starting A Run

Use a goal that describes the outcome, not only the task mechanics.

Good goals:

- `Fix the desktop launcher validation bug and add focused tests.`
- `Review the provider config docs for gaps and rewrite unclear sections.`
- `Implement the session run summary UI without changing orchestration behavior.`

Weak goals:

- `Fix it.`
- `Make better.`
- `Do everything.`

Before starting, check:

- Project is selected.
- Goal is specific.
- Team is selected through providers, an organization preset, or custom agents.
- Rounds are reasonable for the size of the task.
- Permissions match the risk.

## Team Selection

### Provider Pipeline

A provider pipeline runs selected providers in order, for example:

```text
claude -> codex
```

This is best for simple handoffs where one agent reviews or plans and another implements.

### Organization Preset

An organization preset runs named roles over the same durable session state. The built-in `software-team` preset includes manager, architect, builders, tester, reviewer, security, and docs roles.

Use an organization when the work benefits from multiple perspectives, for example architecture, implementation, testing, security, and documentation.

### Custom Agents

Custom agents let you define role labels, provider choices, model overrides, and responsibilities directly in the desktop launcher.

Use custom agents when the built-in preset is close but not specific enough.

## Permissions

The permission selector is one of the most important safety controls.

- Plan only: agents can reason and propose changes, but should not edit the workspace.
- Edit workspace: Codex-style builders may write inside the selected project.
- Trusted full access: enables unsafe mode for trusted worktrees. Use only when you understand the consequences.
- Claude tools: optional tool access for Claude. It is off by default.

If you are unsure, start with Plan only. Move to Edit workspace after the plan is clear.

## Run Phases

The UI uses the same phases as durable `status.json` files:

- `running`: a provider or role is still working.
- `done`: the run reached a completed state.
- `blocked`: a provider failed, hit auth/quota/payment limits, or explicitly reported a blocker.
- `rounds_exhausted`: the configured round limit was reached before a done or blocked state.
- `unknown`: the app could not read enough durable state to classify the run.

Blocked does not mean the app is broken. It means the orchestrator stopped safely and wrote the reason to durable files.

## Recovery Center

The Recovery Center converts run state into next actions. It is most useful after a blocked or round-limited run.

Use it to answer:

- What phase is the run in?
- Which provider or role stopped?
- What blocker was reported?
- Which durable file should I open first?
- Is this a user action, provider/auth action, or code follow-up?

For blocked runs, inspect files in this order:

1. `provider-state.json`
2. `status.json`
3. `handoff.md`
4. `transcript.md`

## Durable Files

Every run writes files under:

```text
<workspace>\.duet\sessions\<timestamp>\
```

Important files:

- `transcript.md`: full public conversation and status.
- `events.ndjson`: machine-readable provider turn log.
- `status.json`: latest lifecycle phase, final status, project, rounds, and provider summary.
- `handoff.md`: focused provider-to-provider handoff notes.
- `provider-state.json`: latest per-provider state, limits, usage, and handoffs.
- `org-state.json`: role statuses and blockers for organization runs.

The desktop app opens these files directly when they exist. The CLI can inspect the same state:

```powershell
ao status
ao status --json
ao tail --follow
```

## What To Check When A Run Looks Wrong

Use this checklist before changing code:

- Is the active project the workspace you expected?
- Did the goal ask for a concrete outcome?
- Is the provider selected and configured?
- Did `ao doctor` pass?
- Is a provider out of quota or missing authentication?
- Was the run started in Plan only when you expected edits?
- Did the round limit stop the run early?
- Does `handoff.md` contain a useful next step?
- Does `transcript.md` show a provider error or refusal?

## UI Improvement Areas

The current desktop app is functional, but these are high-value areas to improve next:

- Packaging: add a repeatable Windows installer or portable build.
- Visual verification: add Playwright or Electron screenshot checks for core desktop flows.
- First-run onboarding: detect missing projects/providers and show a guided setup path.
- Provider health: make auth, quota, and tool readiness visible before launch.
- Resume flow: turn `rounds_exhausted` and blocked handoffs into an explicit resume action.
- Safer file actions: show file existence and last modified time before opening.
- Streaming: move from polling durable files toward event-based updates where possible.
- Accessibility: improve keyboard navigation, focus order, labels, and contrast testing.
- Run comparison: compare recent runs by phase, provider, duration, blockers, and cost/usage when available.
