# Project Registry

Artificial Orchestrator keeps a small local project registry so repeated runs do not need long workspace paths.

## Commands

```powershell
ao project add ims --path C:\Users\kanta\source\repos\ims-th-solution --use
ao project list
ao project current
ao project use ims
```

The first project added becomes active. Use `--use` when adding a project to make it active immediately.

## Running

```powershell
ao run --project ims --goal "finish the market data feature cleanly"
```

If `--project` and `--workspace` are omitted, `ao run` and `ao org run` use the active project. If no active project exists, they use the current working directory and label it as unregistered.

## Registry Location

By default the registry is stored in the user config directory:

- Windows: `%APPDATA%\artificial-orchestrator\projects.json`
- macOS/Linux: `~/.config/artificial-orchestrator/projects.json`

Set `ARTIFICIAL_ORCHESTRATOR_HOME` or `AO_HOME` to move the registry. Tests and automation can also pass `--project-registry <path>`.
