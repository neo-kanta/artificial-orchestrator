# Architecture

Artificial Orchestrator is organized around one rule: provider orchestration is the product core, and every interface is an adapter over that core.

## Layers

### Interface adapters

- `bin/duet.js` starts the CLI.
- `src/cli.js` translates CLI arguments into application requests.
- `desktop/` contains the Electron shell.
- `desktop/renderer/` contains the browser-side GUI controller and view rendering.
- `desktop/renderer/launch-state.js` keeps launcher readiness and summary rules deterministic and testable without duplicating run orchestration.

Adapters should not duplicate orchestration behavior. They gather input, present state, and call application services.

### Application services

- `src/application/run-options.js` prepares validated run options from UI or CLI input.
- `src/application/gui-service.js` exposes project, provider, organization, launch, monitor, and recent-run history operations for the desktop shell.

Application services are the boundary where project registry, config, runtime flags, provider selection, and organization presets are composed into a run request.

### Domain helpers

- `src/domain/run-status.js` normalizes provider/run statuses and blocker/provider-state projections.
- `src/domain/handoff.js` extracts durable handoffs from structured or text provider output.

Domain helpers are deterministic and do not touch the filesystem or spawn providers.

### Core orchestration and durable state

- `src/orchestrator.js` runs provider turns and decides when a run is done, blocked, or rounds-exhausted.
- `src/logger.js` owns durable session files under `.duet/sessions/<id>/`.
- `src/status.js` reads and formats the latest durable run status.
- `src/status.js` can also read a specific session or enumerate recent sessions for GUI-facing history views.
- `src/tail.js` streams the latest transcript.

These modules are shared by the CLI and desktop GUI. Any new interface should reuse them rather than implementing its own run loop.

### Provider and platform adapters

- `src/providers.js` adapts OpenAI, Claude, Codex, and custom command providers to one provider result shape.
- `src/process.js` wraps subprocess execution.
- `src/config.js`, `src/orgs.js`, `src/projects.js`, and `src/runtime.js` resolve local configuration and runtime defaults.
- `src/shared/` contains small filesystem/text utilities with no product policy.

## Design constraints

- Provider secrets stay in environment/config plumbing and are never rendered in GUI catalog output.
- Provider limits, authentication, quota, and payment blockers are surfaced as blockers, not bypassed.
- The CLI and desktop app must use the same project registry, provider config, organization presets, and durable session files.
- New provider kinds should implement the provider result contract in `src/providers.js` before touching orchestration.
- New UI surfaces should call application services and status snapshots instead of reading random session files directly.
