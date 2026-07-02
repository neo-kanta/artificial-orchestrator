# Advisor mode

Advisor mode is a durable workflow for using Artificial Orchestrator as a planning, review, and handoff system around Codex and Claude.

It is designed for two situations:

1. **Normal model-backed work** - Codex can build, Claude can review, and OpenAI can coordinate if configured.
2. **Model-unavailable work** - one or more model providers are unavailable because of authentication, quota, payment, local CLI, or model-access issues. The run falls back to deterministic local guidance instead of pretending the unavailable model succeeded.

## Quick start

Show the built-in advisor organization:

```powershell
node .\bin\duet.js org show advisor-council
```

Run advisor mode against the active project:

```powershell
ao org run advisor-council --goal "Plan and safely implement the next fix"
```

Run advisor mode against a specific workspace:

```powershell
ao org run advisor-council --workspace C:\Users\kanta\source\repos\my-project --goal "Review the design and tell Codex what to do"
```

Allow Codex-backed roles to edit the target workspace:

```powershell
ao org run advisor-council --workspace C:\Users\kanta\source\repos\my-project --goal "Implement the approved fix" --apply
```

## Roles

`advisor-council` runs these roles over the same durable transcript, handoff, provider state, and organization state:

| Role | Primary provider | Fallback | Purpose |
| --- | --- | --- | --- |
| `advisor` | `openai` | `local-advisor` | Clarify the goal, write the implementation plan first, and set guardrails. |
| `claude-reviewer` | `claude` | `local-advisor` | Review architecture, risks, and instructions for Codex. |
| `codex-builder` | `codex` | `local-advisor` | Implement scoped changes when `--apply` is enabled, otherwise produce proposed changes. |
| `final-advisor` | `openai` | `local-advisor` | Synthesize outputs, list verification evidence, and close the advisory package. |

## Fallback behavior

Provider specs and organization roles can declare fallback providers:

```json
{
  "providers": {
    "planner": {
      "kind": "openai",
      "model": "gpt-5.5",
      "fallbackProviders": ["local-advisor"]
    }
  }
}
```

When the primary provider returns a failed result or throws, the orchestrator tries each fallback provider in order using the same prompt. If a fallback succeeds:

- the transcript clearly says which provider failed and which fallback was used;
- `status.json`, `provider-state.json`, and `events.ndjson` include fallback metadata;
- the fallback output still uses normal `status: continue | done | blocked` handling.

If all fallbacks fail, the run blocks with the collected failure summary.

## Local advisor

`local-advisor` is a deterministic command provider implemented by `examples/local-advisor.js`. It does not call a model. It reads the provider prompt from stdin and returns JSON containing:

- a safe continuation checklist;
- suggested files to inspect;
- suggested verification commands;
- a concise handoff;
- `status: continue` for intermediate roles and `status: done` for `final-advisor`.

Use it for planning, summaries, low-risk checklists, and manual next steps. Do not use it as a substitute for model reasoning on high-risk architecture, security, finance, legal, or production-change decisions.

## Codex setup

This repository includes `AGENTS.md` so Codex starts with persistent project expectations:

- write an implementation plan before editing;
- keep provider failures visible;
- keep Codex read-only unless `--apply` is enabled;
- keep Claude no-tools unless `--claude-tools` is enabled;
- run `npm test` after JavaScript changes.

For personal defaults across all repositories, put your own guidance in `%USERPROFILE%\.codex\AGENTS.md`. Keep this repo's `AGENTS.md` focused on Artificial Orchestrator behavior.

## Recommended operating pattern

1. Start with plan-only advisor mode:

   ```powershell
   ao org run advisor-council --goal "Plan the change and identify risks"
   ```

2. Inspect the transcript and handoff under:

   ```text
   <workspace>\.duet\sessions\<timestamp>\
   ```

3. Re-run with `--apply` only after the plan is acceptable:

   ```powershell
   ao org run advisor-council --goal "Implement the approved plan" --apply
   ```

4. Verify:

   ```powershell
   npm test
   ao status
   ```

5. If a provider is unavailable, read the fallback handoff and decide whether to wait for the model, switch providers, or continue manually.
