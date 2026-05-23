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
The resolved workspace must already exist when a run starts; the CLI stops early rather than creating a new empty directory from an incorrect project path.

## Registry Location

By default the registry is stored in the user config directory:

- Windows: `%APPDATA%\artificial-orchestrator\projects.json`
- macOS/Linux: `~/.config/artificial-orchestrator/projects.json`

Set `ARTIFICIAL_ORCHESTRATOR_HOME` or `AO_HOME` to move the registry. Tests and automation can also pass `--project-registry <path>`.

## Inspecting Runs

`ao status` and `ao tail` use the active project when no `--project` or `--workspace` is passed.
Use `status` for a compact durable-state summary and `tail` for the full transcript:

```powershell
ao status
ao status --project ims
ao status --json
ao tail
ao tail --project ims
ao tail --workspace C:\Users\kanta\source\repos\ims-th-solution
ao tail --follow
```

`ao tail --follow` prints the current transcript and keeps streaming appended provider turns until you stop it.
