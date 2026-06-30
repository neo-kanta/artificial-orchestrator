# Artificial Orchestrator

Artificial Orchestrator coordinates AI providers over a local project. It has a CLI and an Electron desktop app, but both use the same provider-agnostic orchestration engine, project registry, configuration, organization presets, and durable run files.

Claude and Codex are the default architect/builder pair. Configured command providers and the built-in OpenAI adapter use the same run path.

The project records public, useful run state: decisions, tradeoffs, actions, handoffs, status, usage when providers report it, and provider blockers such as auth or quota limits. It does not expose hidden chain-of-thought and it does not bypass provider limits.

## What To Read First

- [Desktop UI Guide](docs/desktop-ui.md) - how to use the GUI, what each screen means, how to inspect blocked runs, and what UI areas need improvement.
- [AI Operating Guide](docs/ai-operator-guide.md) - AI concepts you need to know, how to write better goals, provider safety, evaluation, and improvement areas.
- [Architecture](docs/architecture.md) - module boundaries and where new behavior should live.
- [Provider Configuration](docs/providers.md) - built-in providers, OpenAI, custom command providers, and handoff expectations.
- [AI Organizations](docs/orgs.md) - role-based runs such as `software-team`.
- [Project Registry](docs/projects.md) - saved workspaces and active project behavior.

## Critical Rules

- Keep provider secrets in environment variables or local machine config, not committed files.
- Use Plan only when you want advice without edits.
- Use Edit workspace only for scoped implementation inside the selected project.
- Use Trusted full access only in a worktree you trust and can repair.
- Treat `blocked` as a safe stop, not a crash. Inspect durable files before retrying.
- Run tests and review diffs before committing AI-generated changes.

## Install

```powershell
npm install
npm link
```

Or run without linking:

```powershell
node .\bin\duet.js doctor
```

After linking you can use either `ao`, `artificial-orchestrator`, or the backward-compatible `duet` alias.

## Desktop GUI

Run the Electron desktop shell:

```powershell
npm run desktop
```

The app uses the same project registry, provider configuration, organization presets, orchestration engine, and durable run files as the CLI. For a screen-by-screen walkthrough, see the [Desktop UI Guide](docs/desktop-ui.md).

From the desktop app you can:

- See the active project and workspace path.
- Add, list, and switch projects.
- Browse to a workspace and auto-fill a project name from the folder.
- Enter a goal, choose a provider pipeline or organization preset, and set rounds.
- See a live run summary and readiness check before the Start button is enabled.
- Follow a setup checklist that shows the next missing launcher step.
- Review provider metadata, selected permissions, Claude tool access, and run shape in one place.
- Keep custom agent role/model editing available without making it the default setup path.
- Visualize an organization preset as role nodes with animated handoff paths between agents.
- Inspect role status, active handoff, and role-level blockers directly on the organization map.
- Choose explicit run permissions: plan-only, workspace edit, trusted full access, and Claude tools.
- Start a run for the selected project.
- See active run and last run failure banners without opening terminal output.
- Watch the latest transcript and phase updates while the run is active.
- Review phase, project/org context, blockers, latest handoff, and durable file buttons directly in the session page.
- Use the Recovery Center to see blocked, running, done, or round-limited run guidance with prioritized next actions.
- Browse recent durable runs for the selected project and reload an older run's transcript/status from its session files.
- Open `transcript.md`, `status.json`, `handoff.md`, `provider-state.json`, and `org-state.json` when available.

The desktop shell does not display provider secrets or bypass provider authentication, quota, payment, approval, or usage limits. Provider blockers are shown in the monitor and persisted in the same session files as CLI runs.

## Projects

Register the workspaces you want Artificial Orchestrator to remember:

```powershell
ao project add ims --path C:\Users\kanta\source\repos\ims-th-solution --use
ao project list
ao project current
ao project use ims
```

The first project you add becomes active automatically. After that, `ao run` and `ao org run` use the active project when no `--workspace` or `--project` is provided. You can also select a project for one run:

```powershell
ao run --project ims --goal "finish the market data feature cleanly"
```

## Check The Machine

```powershell
ao doctor
ao doctor --ping
```

`doctor` checks `codex`, `claude`, `git`, `gh`, and GitHub authentication. `--ping` spends a tiny provider call to verify both agent CLIs. If Claude is out of usage, the CLI records the reset time reported by Claude.

## Run A Collaboration

Plan-only mode:

```powershell
ao run --workspace C:\Users\kanta\source\repos\ims-th-solution --goal "finish the market data feature cleanly" --rounds 2
```

Allow Codex to edit files:

```powershell
ao run --workspace C:\Users\kanta\source\repos\ims-th-solution --goal "finish the market data feature cleanly" --rounds 3 --apply
```

Use Claude only as no-tools reviewer/architect, which is the default:

```powershell
ao run --goal "review the architecture and tell Codex what to fix" --rounds 1
```

Session files are written under:

```text
<workspace>\.duet\sessions\<timestamp>\
```

Important files:

- `transcript.md` - human-readable conversation and status.
- `events.ndjson` - machine-readable turn log.
- `status.json` - latest provider status, usage, limits, round state, and final run phase.
- `handoff.md` - durable provider-to-provider handoff notes.
- `provider-state.json` - latest per-provider state and handoff summaries.

Every run prints the selected project name and workspace path before providers start.
The workspace path must already exist; Artificial Orchestrator fails early instead of creating a new empty project directory from a typo.
The full provider response stays in `transcript.md`; `handoff.md` and `provider-state.json` keep the provider's concise `handoff` value or `Handoff:` / `## Handoff` section for the next provider.
If a provider fails, hits a configured limit, or reports `DUET_STATUS: blocked`, the run stops safely and records `phase: "blocked"` in `status.json`.
If a provider reports structured `status: "done"` or text `DUET_STATUS: done` / `ORCHESTRATOR_STATUS: done`, the run records `phase: "done"` and stops without spending more provider calls.
If the configured round limit is reached first, the run records `phase: "rounds_exhausted"` so automation can resume or inspect the handoff.

Inspect the latest durable status for the active project:

```powershell
ao status
ao status --project ims
ao status --json
```

Watch the latest transcript for the active project:

```powershell
ao tail
ao tail --project ims
ao tail --follow
```

Use `--follow` to keep the command attached while a run is active; new transcript entries print as providers finish turns.

## Flexible Providers

Artificial Orchestrator is not limited to this project or only two AIs. Use a provider config to add command-line AIs such as Gemini CLI, Ollama, LM Studio wrappers, or your own scripts.

```powershell
ao providers
ao run --goal "review the repo" --providers claude,codex
ao run --goal "local fallback review" --providers ollama --config .\artificial-orchestrator.config.json
```

See [Provider Configuration](docs/providers.md) and [artificial-orchestrator.config.example.json](artificial-orchestrator.config.example.json).

## OpenAI Provider

Artificial Orchestrator can call OpenAI models directly through the Responses API. Set your API key in the environment:

```powershell
setx OPENAI_API_KEY "sk-..."
```

Check readiness without spending a model call:

```powershell
ao providers doctor openai
```

Optional ping:

```powershell
ao providers doctor openai --ping
```

Use OpenAI in a flat provider pipeline:

```powershell
ao run --providers openai,codex --goal "plan the next release"
```

Configured OpenAI providers keep their configured model. Use `--openai-model <model>` only when you want a single run to override that setting.

## AI Organizations

Organization mode runs named roles over the same durable session state. The built-in `software-team` preset includes manager, architect, Claude builder, Codex builder, tester, reviewer, security, and docs roles.

```powershell
ao org list
ao org show software-team
ao org run software-team --project ims --goal "finish the market data feature cleanly"
```

If `--project` and `--workspace` are omitted, organization runs use the active project from the local registry.

Equivalent run syntax:

```powershell
ao run --org software-team --goal "review, implement, test, and document this safely"
```

Org runs add:

- `org-state.json` - role statuses, phase, blockers, and final decision.
- Role-aware entries in `provider-state.json`, `handoff.md`, and `transcript.md`.

See [AI Organizations](docs/orgs.md).

## Automation Prompts

Reusable prompts live in [docs/prompts](docs/prompts):

- [Codex automation prompt](docs/prompts/codex-automation.md)
- [Claude routine prompt](docs/prompts/claude-routine.md)
- [AI organization handoff](docs/prompts/ai-organization-handoff.md)

They are designed for continuous operation with checkpoints, budget guards, sleep/resume behavior, and local fallback. They do not attempt to bypass paid provider limits.

## Publish Private Repo

GitHub CLI must be authenticated first:

```powershell
gh auth login
```

Then from this repo:

```powershell
ao publish --repo artificial-orchestrator
```

Equivalent helper:

```powershell
.\scripts\publish-private.ps1 -Repo artificial-orchestrator
```

For token scope guidance, see [GitHub Token Permissions](docs/github-token-permissions.md).

## Design

- Claude: architecture direction, risks, review checklist, next instructions.
- Codex: implementation plan or actual edits when `--apply` is set.
- Orchestrator: session state, transcript, token/usage summaries, limit reset capture.
- Default safety: Claude tools are disabled; Codex is read-only unless `--apply` is provided.

For module boundaries and extension points, see [Architecture](docs/architecture.md). For the current restructure notes and next-step handoff, see [Restructure Handoff](docs/restructure-handoff.md).

## Useful Options

```text
--apply                 Allow Codex to edit the workspace.
--unsafe                Let Codex bypass approvals and sandbox in trusted worktrees.
--rounds <n>            Number of collaboration rounds.
--codex-model <model>   Defaults to gpt-5.4-mini for this machine.
--claude-model <model>  Optional Claude model alias/name.
--max-budget-usd <n>    Passed to Claude CLI when supported.
--claude-tools          Allow Claude tools. Default is no-tools architect/reviewer.
```
