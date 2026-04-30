# AI Organization Handoff

Use this handoff when another AI is asked to continue Artificial Orchestrator work.

Artificial Orchestrator is a local, provider-agnostic AI orchestration CLI. It is not a hosted SaaS and should not be redesigned into one. The core idea is durable local coordination between AI providers and AI roles.

Current architecture:

- Providers are adapters. Built-ins include `openai`, `claude`, `codex`, and generic `command`.
- Projects are local workspace registry entries.
- Runs create local durable session files under `.duet/sessions/<timestamp>/`.
- Organization mode maps roles to providers and runs those roles as a pipeline.

Preserve these invariants:

- Keep the orchestration core provider-agnostic.
- Keep default tests offline and deterministic; do not make real provider calls in tests.
- Never log or commit secrets, API keys, tokens, or private keys.
- Persist only public summaries, decisions, actions, blockers, and handoffs.
- Do not include hidden chain-of-thought in transcripts, state files, docs, or prompts.
- Keep destructive actions opt-in through explicit CLI flags.

When adding a new provider:

- Normalize results to `ok`, `text`, `usage`, `costUsd`, `limit`, `errors`, `stderr`, and `durationMs`.
- Add config docs and fake-provider or mocked tests.
- Keep provider-specific quirks inside the adapter.

When adding a new organization:

- Define roles, provider mappings, and responsibilities.
- Keep role output concise and handoff-oriented.
- Update `org-state.json` through the orchestration loop, not by provider-specific code.
