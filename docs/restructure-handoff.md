# Restructure Handoff

This handoff records the folder restructure that moved Artificial Orchestrator from mostly flat `src/` modules toward layered implementation folders.

## What Changed

- CLI implementation moved to `src/cli/index.js` with argument parsing in `src/cli/args.js`.
- Run/session code moved to `src/orchestration/`.
- Local machine/config/process/project/org code moved to `src/platform/`.
- Provider code was split from one `src/providers.js` file into focused adapters under `src/providers/`.
- Terminal styling moved to `src/shared/ansi.js`.
- Top-level `src/*.js` compatibility facades were kept as re-exports.

## Preferred Import Paths

Use these paths for new internal code:

```js
import { runDuet } from "../orchestration/orchestrator.js";
import { latestStatus } from "../orchestration/status-reader.js";
import { loadConfig } from "../platform/config.js";
import { resolveProjectContext } from "../platform/projects.js";
import { callProvider } from "../providers/index.js";
```

Avoid adding new internal imports from the compatibility facades such as `../orchestrator.js`, `../config.js`, or `../providers.js` unless you are maintaining old integration code.

## Extension Points

- Add a provider adapter in `src/providers/<name>.js`, export it from `src/providers/index.js`, then hydrate its config in `src/platform/config.js` if it needs runtime defaults.
- Add session behavior in `src/orchestration/session-store.js`.
- Add run-loop behavior in `src/orchestration/orchestrator.js`.
- Add pure status, blocker, handoff, or recovery logic in `src/domain/`.
- Add desktop-facing composition in `src/application/gui-service.js`, not in `desktop/main.js`.

## Follow-Up Work

- Split `desktop/renderer/view.js` by GUI view when the desktop UI changes next.
- Split `desktop/styles.css` by surface when the related view files are split.
- Consider moving CLI subcommands from `src/cli/index.js` into `src/cli/commands/` once the command file grows again.
- Gradually update tests to import from the new implementation paths when touching each area.

## Verification

After the restructure, the full test suite passed with:

```powershell
npm test
```
