# Provider Configuration

Artificial Orchestrator is provider-driven. The default pipeline is:

```text
claude -> codex
```

You can replace or extend that pipeline with any command-line AI that can receive a prompt and print a response.
OpenAI API is also available as a built-in direct provider.

## Quick Commands

```powershell
ao providers
ao providers doctor openai
ao run --goal "review this repo" --providers claude,codex
ao run --goal "plan this repo" --providers openai,codex
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
    },
    "openai-planner": {
      "label": "OpenAI Planner",
      "kind": "openai",
      "role": "planner",
      "model": "gpt-5.5",
      "reasoning": "medium",
      "responseFormat": "json",
      "maxOutputTokens": 4096
    }
  }
}
```

## Provider Fields

- `id`: implied by the object key.
- `label`: human-friendly display name.
- `kind`: `command` for custom providers. Built-ins use `claude` and `codex`.
- `kind`: `openai` for direct OpenAI Responses API calls.
- `role`: appears in the prompt, for example `architect`, `builder`, `reviewer`, `researcher`, or `local-fallback`.
- `command`: executable to run.
- `args`: command arguments. Use `{{prompt}}` to inject the generated prompt.
- `promptMode`: `stdin`, `arg`, or `arg-template`.
- `parser`: `text` or `json`.
- `env`: optional environment variables. Template values are supported.
- `timeoutMs`: per-provider timeout.

## OpenAI Fields

- `model`: OpenAI model id. Default: `gpt-5.5`.
- `reasoning`: optional effort value such as `low`, `medium`, `high`, or `xhigh`.
- `responseFormat`: `json` for structured role output, or `text`.
- `maxOutputTokens`: passed to the Responses API as `max_output_tokens`.

OpenAI credentials are read from `OPENAI_API_KEY`. Do not put secrets in provider config.

## Maintainer Notes

Keep provider adapters small. If a provider has structured output, add a parser but keep the orchestration loop unchanged. Built-in providers should only handle CLI quirks, auth/limit parsing, and usage extraction.

Providers receive both recent transcript text and durable state before every turn:

- `handoff.md` carries concise provider-to-provider handoff notes.
- `provider-state.json` carries latest per-provider status, limits, usage, and handoff summaries.
- `status.json` carries the durable run lifecycle with `phase` values such as `running`, `done`, `blocked`, and `rounds_exhausted`.

Adapters should keep their public output concise and include a short handoff for the next provider. Structured JSON providers should set top-level `status` and `handoff` strings; text providers should include a `Status:`/`DUET_STATUS:` line and a `Handoff:` line or section. The orchestrator keeps the full response in `transcript.md`, but persists only the extracted handoff in `handoff.md` and `provider-state.json` so later providers read focused state instead of stale full-turn output. The orchestrator persists that handoff even when a provider blocks on limits or credentials.
Flat provider runs stop as soon as a provider fails, reports `DUET_STATUS: blocked`, or reports completion with `DUET_STATUS: done` / `ORCHESTRATOR_STATUS: done`; this avoids spending later provider calls after the durable state is already terminal.

CLI and orchestrator tests can inject a provider call function into `main(argv, { callProvider })` or `runDuet({ callProvider })`. Use that path for deterministic coverage of provider routing, prompts, session files, and org state; reserve spawned command providers for adapter-level tests because some CI and sandbox environments block child-process execution.
