# Provider Configuration

Artificial Orchestrator is provider-driven. The default pipeline is:

```text
claude -> codex
```

You can replace or extend that pipeline with any command-line AI that can receive a prompt and print a response.

## Quick Commands

```powershell
ao providers
ao run --goal "review this repo" --providers claude,codex
ao run --project ims --goal "review this repo" --providers claude,codex
ao run --goal "local fallback review" --providers local-reviewer --config .\artificial-orchestrator.config.json
```

## Config File

Copy the example:

```powershell
Copy-Item .\artificial-orchestrator.config.example.json .\artificial-orchestrator.config.json
```

The config shape is:

```json
{
  "pipeline": ["claude", "codex"],
  "providers": {
    "my-ai": {
      "label": "My AI",
      "kind": "command",
      "role": "reviewer",
      "command": "my-ai",
      "args": ["--prompt", "{{prompt}}"],
      "promptMode": "arg-template",
      "parser": "text",
      "timeoutMs": 300000
    }
  }
}
```

## Provider Fields

- `id`: implied by the object key.
- `label`: human-friendly display name.
- `kind`: `command` for custom providers. Built-ins use `claude` and `codex`.
- `role`: appears in the prompt, for example `architect`, `builder`, `reviewer`, `researcher`, or `local-fallback`.
- `command`: executable to run.
- `args`: command arguments. Use `{{prompt}}` to inject the generated prompt.
- `promptMode`: `stdin`, `arg`, or `arg-template`.
- `parser`: `text` or `json`.
- `env`: optional environment variables. Template values are supported.
- `timeoutMs`: per-provider timeout.

## Maintainer Notes

Keep provider adapters small. If a provider has structured output, add a parser but keep the orchestration loop unchanged. Built-in providers should only handle CLI quirks, auth/limit parsing, and usage extraction.

Providers receive both recent transcript text and durable state before every turn:

- `handoff.md` carries concise provider-to-provider handoff notes.
- `provider-state.json` carries latest per-provider status, limits, usage, and handoff summaries.

Adapters should keep their public output concise and include a short handoff for the next provider. The orchestrator persists that handoff even when a provider blocks on limits or credentials.
