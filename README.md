# Artificial Orchestrator

Artificial Orchestrator is a provider-agnostic CLI for coordinating AI agents in a local terminal. Claude and Codex are the default architect/builder pair, but configured command providers and the built-in OpenAI adapter use the same durable orchestration path. Every public exchange is written to a transcript plus an NDJSON machine log.

It does not expose hidden chain-of-thought. It shows the useful parts: decisions, tradeoffs, actions, token usage when a CLI reports it, and provider limits such as Claude reset windows.

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
```

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

Configured OpenAI providers keep their configured model, reasoning effort, and output-token limit. Use `--openai-model <model>`, `--openai-reasoning <effort>`, or `--openai-max-output-tokens <n>` only when you want a single run to override those settings.

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

## Useful Options

```text
--apply                 Allow Codex to edit the workspace.
--unsafe                Let Codex bypass approvals and sandbox in trusted worktrees.
--rounds <n>            Number of collaboration rounds.
--codex-model <model>   Defaults to gpt-5.4-mini for this machine.
--claude-model <model>  Optional Claude model alias/name.
--openai-reasoning <n>  Optional OpenAI reasoning effort.
--openai-max-output-tokens <n>  Override OpenAI output tokens for one run.
--max-budget-usd <n>    Passed to Claude CLI when supported.
--claude-tools          Allow Claude tools. Default is no-tools architect/reviewer.
```
