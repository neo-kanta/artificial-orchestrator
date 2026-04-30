# Artificial Orchestrator

Artificial Orchestrator is a tiny CLI for watching Codex and Claude collaborate in a local terminal. Claude acts as the architect/reviewer by default, Codex acts as the builder/executor, and every public exchange is written to a transcript plus an NDJSON machine log.

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
- `status.json` - latest provider status, usage, limits, and round state.

## Flexible Providers

Artificial Orchestrator is not limited to this project or only two AIs. Use a provider config to add command-line AIs such as Gemini CLI, Ollama, LM Studio wrappers, or your own scripts.

```powershell
ao providers
ao run --goal "review the repo" --providers claude,codex
ao run --goal "local fallback review" --providers ollama --config .\artificial-orchestrator.config.json
```

See [Provider Configuration](docs/providers.md) and [artificial-orchestrator.config.example.json](artificial-orchestrator.config.example.json).

## Automation Prompts

Reusable prompts live in [docs/prompts](docs/prompts):

- [Codex automation prompt](docs/prompts/codex-automation.md)
- [Claude routine prompt](docs/prompts/claude-routine.md)

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
--max-budget-usd <n>    Passed to Claude CLI when supported.
--claude-tools          Allow Claude tools. Default is no-tools architect/reviewer.
```

## Notes

Your current Claude CLI may report a usage limit such as:

```text
You've hit your limit; resets 1:20pm (Asia/Bangkok)
```

Artificial Orchestrator treats that as a provider status, writes it into the session, and lets Codex continue if possible.
