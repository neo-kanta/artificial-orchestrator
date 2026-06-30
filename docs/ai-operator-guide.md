# AI Operating Guide

This guide explains the AI concepts that matter when using or improving Artificial Orchestrator. It is written for an operator or maintainer who wants better results from multi-agent runs without hiding important risks.

## What The Orchestrator Actually Does

Artificial Orchestrator coordinates AI providers. It does not make the models smarter by itself.

For each run, it:

1. Resolves the active project or workspace.
2. Builds a prompt from the goal, workspace snapshot, transcript history, durable state, and provider role.
3. Calls providers in a flat pipeline or organization role order.
4. Records each public response in durable files.
5. Extracts a concise handoff for the next provider.
6. Stops when a provider reports done, blocked, failure, or the configured round limit is reached.

The quality of a run depends on the goal, provider configuration, role design, permissions, and whether the durable handoff stays focused.

## Terms You Need To Know

- Provider: an AI backend or CLI adapter, such as Claude, Codex, OpenAI, or a custom command.
- Model: the specific AI model used by a provider.
- Role: the job a provider should perform, such as architect, builder, tester, reviewer, security, or docs.
- Pipeline: a simple ordered provider list.
- Organization: a named role pipeline with responsibilities for each role.
- Prompt: the instruction package sent to a provider.
- Context: the information included in the prompt.
- Token: a chunk of text the model reads or writes. More tokens usually mean more cost and more chance of hitting limits.
- Handoff: the concise durable instruction passed from one provider or role to the next.
- Blocker: a reason the run safely stopped, such as missing auth, quota, unsafe permissions, unclear task, or a provider error.
- Evaluation: the evidence that a run produced a correct result, usually tests, screenshots, logs, or review notes.

## What AI Is Good At Here

AI agents are useful for:

- Reading unfamiliar code and summarizing structure.
- Drafting implementation plans.
- Finding likely bugs and missing edge cases.
- Writing scoped code changes.
- Creating tests around changed behavior.
- Reviewing docs for missing user context.
- Explaining tradeoffs and risks.

AI agents are weaker at:

- Knowing private project intent that is not in the prompt or files.
- Guaranteeing correctness without tests.
- Understanding hidden business constraints.
- Managing secrets safely unless the system keeps them out of view.
- Long tasks with unclear stopping criteria.
- UI polish without visual verification.
- Remembering decisions unless they are written to durable files.

## How To Write Better Goals

A strong goal has four parts:

- Outcome: what should be true when the run is done.
- Scope: where the agent should work.
- Constraints: what must not change.
- Verification: how success should be checked.

Template:

```text
In <area>, achieve <outcome>. Keep <constraints>. Verify with <tests or checks>.
```

Examples:

```text
In the desktop session view, show blocked run context without changing orchestration behavior. Keep the UI compact. Verify with renderer helper tests and npm test.
```

```text
Rewrite README and docs for non-terminal users. Cover desktop UI, provider limits, durable files, and improvement areas. Keep commands Windows-friendly.
```

Avoid goals that mix too many unrelated tasks. Smaller runs produce better handoffs and safer diffs.

## Choosing Providers

Use a flat provider pipeline when the task is narrow:

```text
claude -> codex
```

Use an organization when the task has multiple concerns:

- Product or UX direction.
- Architecture tradeoffs.
- Implementation.
- Tests.
- Security.
- Documentation.

Use OpenAI direct providers for stable API-backed roles that should not depend on a local CLI. Use command providers when you want to integrate another local AI tool.

## Context And Tokens

More context is not always better. Long prompts can:

- Hide the most important instruction.
- Increase latency and cost.
- Push useful details out of the model context window.
- Make providers repeat stale decisions.

This project uses `handoff.md` and `provider-state.json` to keep the next provider focused. Do not replace those with full transcript stuffing unless there is a clear reason.

Useful context:

- The current goal.
- The active project path.
- Recent relevant transcript.
- Focused handoff.
- Current provider state and blockers.
- Small workspace snapshot.

Risky context:

- Secrets.
- Private keys.
- Huge logs without summarization.
- Full unrelated transcripts.
- Ambiguous instructions from old runs.

## Status And Stop Conditions

Providers should report status clearly. The orchestrator recognizes done, blocked, and continue-style output from structured JSON or text markers.

Important stop conditions:

- Done: no further provider calls should be spent.
- Blocked: user or environment action is needed before continuing.
- Rounds exhausted: the orchestrator stopped because the configured round count ended.
- Provider failure: a subprocess or API call failed and the failure was persisted.

The right behavior is to stop safely and write durable state. Do not try to bypass provider auth, usage limits, payment limits, or approval constraints.

## Safety Rules

Treat AI providers like powerful external operators:

- Never put secrets in docs, prompts, screenshots, or provider config.
- Keep provider env vars in the environment, not committed files.
- Use Plan only for uncertain tasks.
- Use Edit workspace only for scoped implementation.
- Use Trusted full access only in a worktree you are prepared to repair.
- Keep destructive actions explicit.
- Review diffs before committing.
- Run tests before pushing.

The desktop app and CLI should surface blockers instead of hiding them.

## Evaluation: How You Know A Run Worked

A good run ends with evidence, not just a confident message.

Use the strongest available checks:

- Unit tests for pure helpers and adapters.
- CLI tests for command behavior.
- Renderer tests for deterministic UI state.
- Electron or browser screenshots for layout changes.
- `node --check` for syntax on touched JavaScript files.
- `npm test` for full repo regression.
- Manual file inspection for durable session files.

For UI work, code tests are not enough. Add visual verification when layout, responsive behavior, or interactive state changes.

## Common Failure Modes

- Vague goal: agents produce broad advice instead of a useful patch.
- Too many rounds: providers spend tokens repeating previous conclusions.
- Too few rounds: handoff is useful but not implemented.
- Wrong project: run targets a different workspace than expected.
- Missing provider auth: run blocks before useful work begins.
- Unsafe permission mismatch: user expects edits, but run is Plan only.
- No visual QA: UI compiles but looks wrong.
- Weak tests: code changes pass syntax but break behavior later.
- Huge transcript reliance: later providers inherit stale or irrelevant context.

## Areas You Should Improve

### Product

- Make first-run setup clearer for non-terminal users.
- Add a visible provider health panel before launch.
- Build a one-click resume flow from `handoff.md`.
- Package the desktop app for Windows users.
- Add visual regression checks for the desktop shell.
- Add run comparison and filtering for recent sessions.
- Show clearer cost, token, and duration metrics when providers report them.

### Architecture

- Keep orchestration in shared modules, not renderer code.
- Keep GUI state APIs sanitized and deterministic.
- Add pure domain helpers for new status or recovery logic.
- Keep provider adapters small and testable.
- Avoid duplicating CLI behavior in Electron IPC handlers.

### AI Workflow

- Write smaller, testable goals.
- Ask agents to state assumptions and verification commands.
- Treat handoff quality as a product feature.
- Prefer explicit blockers over forced continuation.
- Use specialized roles only when their output changes decisions.
- Keep a human review step before merging.

### UI Quality

- Verify desktop views at desktop and narrow widths.
- Check long project paths, long goals, long blocker text, and missing files.
- Make every disabled state explain why it is disabled.
- Keep advanced provider controls available but not in the default path.
- Prefer dense operational information over marketing-style screens.

## Maintainer Checklist For AI Features

Before adding an AI-facing feature, answer:

- Which shared service owns the behavior?
- Which durable file records the result?
- What is safe to show in the GUI?
- What must never be rendered?
- What happens when a provider blocks?
- What happens when the run reaches the round limit?
- What test proves the behavior?
- What does the user do next when it fails?

If these answers are unclear, improve the design before adding UI.
