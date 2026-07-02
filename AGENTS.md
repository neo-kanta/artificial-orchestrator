# Artificial Orchestrator agent guidance

## Project role

This repository builds a provider-agnostic orchestration CLI and desktop shell for coordinating Codex, Claude, OpenAI, and command-based providers. Act as an advisor first: clarify the goal, produce an implementation plan before editing, then make scoped changes only when the run mode permits it.

## Advisor workflow

- For user requests about coordinating Codex, Claude, or model availability, prefer the `advisor-council` organization preset.
- Preserve graceful degradation: provider authentication, quota, payment, or model availability failures must become visible blockers or fallback handoffs; do not hide them or bypass limits.
- When a requested model is unavailable, fall back to deterministic local guidance only for planning, review checklists, commands, and manual next steps.
- Do not claim the local fallback is an intelligent model. Label it as deterministic guidance.
- Keep Claude no-tools by default unless the user explicitly enables `--claude-tools`.
- Keep Codex read-only unless `--apply` is set; use `--unsafe` only in trusted worktrees and only when explicitly requested.

## Architecture expectations

- CLI and desktop must share the same application services and orchestration engine.
- Provider adapters must return the normalized provider result shape used by `src/orchestration/orchestrator.js`.
- Domain helpers in `src/domain/` must remain deterministic and filesystem-free.
- New organization presets belong in `src/platform/orgs.js`; provider defaults belong in `src/platform/config.js`.
- Document user-visible behavior changes in `README.md` or `docs/`.

## Verification

- Run `npm test` after changing JavaScript source or tests.
- Run `node ./bin/duet.js org show advisor-council` after changing advisor organization configuration.
- Run `node ./bin/duet.js providers` after changing provider defaults.
- If provider CLIs are involved, use `node ./bin/duet.js doctor` and only use `--ping` when a paid/remote model call is acceptable.
