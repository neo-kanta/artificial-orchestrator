# Architecture

Artificial Orchestrator is organized around one rule: provider orchestration is the product core, and every interface is an adapter over that core.

For product-facing behavior, read this file together with:

- [Desktop UI Guide](desktop-ui.md) for the user workflow, GUI surfaces, recovery behavior, and UI improvement areas.
- [AI Operating Guide](ai-operator-guide.md) for provider concepts, AI safety, evaluation practice, and improvement priorities.

The repository uses a layered layout:

```text
bin/                         CLI executable shim
desktop/                     Electron shell and renderer UI
src/
  cli/                       CLI argument handling and command routing
  application/               Use-case services shared by interfaces
  domain/                    Pure status, handoff, and recovery rules
  orchestration/             Run loop, prompts, session files, status, tail
  platform/                  Local machine, config, process, project, org adapters
  providers/                 AI provider adapters and provider output parsers
  shared/                    Small general utilities with no product policy
test/                        Node test files
docs/                        User and maintainer documentation
```

## Layers

### Interface Adapters

- `bin/duet.js` starts the CLI.
- `src/cli/index.js` translates CLI arguments into application requests.
- `desktop/main.js` owns Electron process setup and IPC registration.
- `desktop/renderer/` contains the browser-side GUI controller and view rendering.
- `desktop/renderer/launch-state.js` keeps launcher readiness and summary rules deterministic and testable without duplicating run orchestration.

Adapters gather input, present state, and call application services or orchestration entry points. They should not implement their own provider run loop or read arbitrary durable session files directly.

### Application Services

- `src/application/run-options.js` prepares validated run options from UI or CLI input.
- `src/application/gui-service.js` exposes project, provider, organization, launch, monitor, and recent-run history operations for the desktop shell.

Application services are the boundary where project registry, config, runtime flags, provider selection, and organization presets are composed into a run request.

### Domain Helpers

- `src/domain/run-status.js` normalizes provider/run statuses and blocker/provider-state projections.
- `src/domain/handoff.js` extracts durable handoffs from structured or text provider output.
- `src/domain/recovery.js` turns public run snapshots into GUI recovery guidance and prioritized durable file actions.

Domain helpers are deterministic. They should not touch the filesystem, spawn providers, read environment variables, or depend on Electron.

### Orchestration

- `src/orchestration/orchestrator.js` runs provider turns and decides when a run is done, blocked, or rounds-exhausted.
- `src/orchestration/session-store.js` owns durable session files under `.duet/sessions/<id>/`.
- `src/orchestration/status-reader.js` reads, enumerates, and formats durable run status.
- `src/orchestration/transcript-tail.js` streams the latest transcript.
- `src/orchestration/prompts.js` builds provider prompts from the goal, snapshot, history, and durable state.

These modules are shared by the CLI and desktop GUI. Any new interface should reuse them rather than implementing its own run/session behavior.

### Provider Adapters

- `src/providers/index.js` dispatches a provider spec to the correct adapter.
- `src/providers/openai.js` calls the OpenAI Responses API and parses structured provider results.
- `src/providers/codex.js` runs Codex CLI and normalizes JSONL output.
- `src/providers/claude.js` runs Claude CLI and normalizes JSON output.
- `src/providers/command.js` runs configured command providers.
- `src/providers/parsers.js` contains provider output parsers shared by adapters and diagnostics.

Provider adapters return one provider result shape for orchestration. New provider kinds should start here before touching the run loop.

### Platform Adapters

- `src/platform/config.js` loads and normalizes provider/org config.
- `src/platform/orgs.js` resolves organization presets into hydrated provider roles.
- `src/platform/projects.js` manages saved workspace registry state.
- `src/platform/process.js` wraps subprocess execution.
- `src/platform/runtime.js` resolves runtime defaults and CLI flags.
- `src/platform/snapshot.js` captures lightweight workspace state.
- `src/platform/doctor.js` checks local tool readiness.
- `src/platform/publish.js` wraps private repo publishing commands.

Platform adapters are allowed to touch the filesystem, environment, subprocesses, and local machine state. Keep those concerns out of `domain/`.

### Shared Utilities

- `src/shared/text.js` contains text compaction helpers.
- `src/shared/workspace.js` contains workspace path checks and safe file reads.
- `src/shared/ansi.js` contains terminal styling helpers.

Shared utilities should stay small and policy-free. If a helper knows about providers, sessions, projects, or GUI behavior, it belongs in a more specific layer.

## Compatibility Facades

The old top-level files under `src/` remain as re-export facades, for example:

- `src/orchestrator.js` re-exports `src/orchestration/orchestrator.js`.
- `src/logger.js` re-exports `src/orchestration/session-store.js`.
- `src/providers.js` re-exports `src/providers/index.js`.
- `src/config.js` re-exports `src/platform/config.js`.

Internal code should prefer the new foldered paths. External scripts and older tests can keep using the facades until they are migrated naturally.

## Design Constraints

- Provider secrets stay in environment/config plumbing and are never rendered in GUI catalog output.
- Provider limits, authentication, quota, and payment blockers are surfaced as blockers, not bypassed.
- The CLI and desktop app must use the same project registry, provider config, organization presets, and durable session files.
- New provider kinds should implement the provider result contract in `src/providers/` before touching orchestration.
- New UI surfaces should call application services and status snapshots instead of reading random session files directly.
- New domain rules should be pure and covered by direct tests.
