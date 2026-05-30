# AI Organizations

Artificial Orchestrator can run a named organization instead of a flat provider pipeline. An organization is a role pipeline over the same local session files, so the system stays provider-agnostic and durable.

## Built-In Organization

```powershell
ao org list
ao org show software-team
```

`software-team` includes:

- `manager` - breaks down the goal and tracks whether the run should continue, finish, or block.
- `architect` - identifies architecture direction, interfaces, risks, and constraints.
- `builder-claude` - proposes implementation strategy, edge cases, and build risks.
- `builder-codex` - implements or proposes scoped code changes using Claude's builder guidance.
- `tester` - defines and reviews verification commands and test gaps.
- `reviewer` - checks behavior changes, regressions, and maintainability.
- `security` - checks credentials, destructive actions, and unsafe permissions.
- `docs` - checks user-facing documentation and examples.

Default role mapping:

```text
manager   -> openai
architect -> openai
builder-claude -> claude
builder-codex  -> codex
tester    -> openai
reviewer  -> claude
security  -> openai
docs      -> openai
```

## Running

```powershell
ao org run software-team --project ims --goal "finish the market data feature cleanly"
```

When `--project` and `--workspace` are omitted, `ao org run` uses the active project from the project registry.

Equivalent:

```powershell
ao run --org software-team --goal "review, implement, test, and document this safely"
```

Use `--apply` only when you want tool-capable providers such as Codex to edit the workspace.

## Durable State

Org mode adds `org-state.json` to the normal session directory:

```text
<workspace>\.duet\sessions\<timestamp>\
```

Important files:

- `org-state.json` - role statuses, phase, blockers, and final decision.
- `status.json` - top-level run lifecycle, including final `done`, `blocked`, or `rounds_exhausted` state.
- `provider-state.json` - provider and role handoff summaries.
- `handoff.md` - readable role-to-role notes.
- `transcript.md` - full public run transcript.

Org runs stop when a configured done or blocked status is reached. The same terminal state is written to `status.json`, `provider-state.json`, and `org-state.json` so later automation can inspect the exact role, round, and blocker.

The desktop GUI reads a sanitized projection of `org-state.json` for the organization map. It shows each role's status, latest round, active handoff, and role blockers without rendering raw role summaries by default.

## Custom Organizations

Add orgs to `artificial-orchestrator.config.json`:

```json
{
  "orgs": {
    "research-team": {
      "label": "Research Team",
      "pipeline": ["manager", "researcher", "reviewer"],
      "roles": {
        "manager": {
          "provider": "openai",
          "responsibility": "Frame the research task and decide when the answer is complete."
        },
        "researcher": {
          "provider": "gemini",
          "responsibility": "Gather broad evidence and summarize tradeoffs."
        },
        "reviewer": {
          "provider": "claude",
          "responsibility": "Check the answer for gaps, unsupported claims, and next actions."
        }
      }
    }
  }
}
```

Keep organization output concise. Persisted role output must not include hidden chain-of-thought, secrets, tokens, or private keys.
