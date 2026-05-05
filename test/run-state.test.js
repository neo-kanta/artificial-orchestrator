import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendTurn, createSession, finalizeSession, readProviderContext } from "../src/logger.js";

test("creates durable session state and appends provider handoffs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao state-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const session = await createSession(root, "ship project registry", {
    project: { name: "demo", path: root, source: "active" }
  });

  const initialContext = await readProviderContext(session);
  assert.match(initialContext.handoff, /No provider handoffs yet/);
  assert.match(initialContext.providerState, /"providers": {}/);

  await appendTurn(session, {
    round: 1,
    provider: "codex",
    ok: true,
    text: "Implemented project registry.\n\nHandoff: tests are ready.",
    usage: { input_tokens: 10, output_tokens: 5 },
    usageLine: "tokens: in 10, out 5",
    costUsd: null,
    limit: null,
    errors: [],
    stderr: "",
    durationMs: 1234
  });

  const handoff = await readFile(join(session.dir, "handoff.md"), "utf8");
  assert.match(handoff, /## Round 1 - codex/);
  assert.match(handoff, /Handoff: tests are ready\./);
  assert.doesNotMatch(handoff, /Implemented project registry/);

  const providerState = JSON.parse(await readFile(join(session.dir, "provider-state.json"), "utf8"));
  assert.equal(providerState.providers.codex.ok, true);
  assert.equal(providerState.providers.codex.lastRound, 1);
  assert.equal(providerState.providers.codex.handoff, "tests are ready.");
  assert.equal(providerState.handoffs.length, 1);
  assert.equal(providerState.handoffs[0].handoff, "tests are ready.");

  const status = JSON.parse(await readFile(join(session.dir, "status.json"), "utf8"));
  assert.equal(status.phase, "running");
  assert.equal(status.project.name, "demo");
  assert.equal(status.rounds[0].provider, "codex");

  await finalizeSession(session, {
    status: "done",
    reason: "provider-reported-done",
    provider: "codex",
    round: 1
  });

  const finalStatus = JSON.parse(await readFile(join(session.dir, "status.json"), "utf8"));
  assert.equal(finalStatus.phase, "done");
  assert.equal(finalStatus.final.provider, "codex");
});

test("persists structured provider handoff instead of full output", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao structured-handoff-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const session = await createSession(root, "coordinate providers");

  await appendTurn(session, {
    round: 1,
    provider: "openai",
    ok: true,
    text: [
      "Implemented a detailed review with several paragraphs.",
      "",
      "Handoff: ignore this fallback when structured output is present.",
      "Status: continue"
    ].join("\n"),
    structured: {
      summary: "Reviewed the next slice.",
      handoff: "Codex should add focused tests for concise handoffs.",
      status: "continue",
      blockers: [],
      filesSuggested: ["src/logger.js"],
      testsSuggested: ["npm test"]
    },
    usage: null,
    usageLine: "usage: unavailable",
    costUsd: null,
    limit: null,
    errors: [],
    stderr: "",
    durationMs: 10
  });

  const providerState = JSON.parse(await readFile(join(session.dir, "provider-state.json"), "utf8"));
  assert.equal(providerState.providers.openai.handoff, "Codex should add focused tests for concise handoffs.");
  assert.equal(providerState.handoffs[0].handoff, "Codex should add focused tests for concise handoffs.");

  const transcript = await readFile(join(session.dir, "transcript.md"), "utf8");
  assert.match(transcript, /Implemented a detailed review/);

  const handoff = await readFile(join(session.dir, "handoff.md"), "utf8");
  assert.match(handoff, /Codex should add focused tests for concise handoffs/);
  assert.doesNotMatch(handoff, /Implemented a detailed review/);
});

test("extracts numbered handoff sections from text providers", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao numbered-handoff-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const session = await createSession(root, "coordinate text provider");

  await appendTurn(session, {
    round: 1,
    provider: "claude",
    ok: true,
    text: [
      "1. Architecture direction",
      "Keep logger responsibilities small.",
      "5. Handoff for next provider",
      "Codex should verify numbered handoff extraction.",
      "1. Run npm test.",
      "6. DUET_STATUS: continue"
    ].join("\n"),
    usage: null,
    usageLine: "usage: unavailable",
    costUsd: null,
    limit: null,
    errors: [],
    stderr: "",
    durationMs: 10
  });

  const providerState = JSON.parse(await readFile(join(session.dir, "provider-state.json"), "utf8"));
  assert.equal(providerState.providers.claude.handoff, "Codex should verify numbered handoff extraction.\n1. Run npm test.");
});

test("creates and updates durable org state for role turns", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao org-state-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const session = await createSession(root, "coordinate org", {
    project: { name: "demo", path: root, source: "active" },
    org: { id: "software-team", label: "Software Team", pipeline: ["manager"] }
  });

  await appendTurn(session, {
    round: 1,
    provider: "manager",
    providerId: "openai",
    providerKind: "openai",
    role: "manager",
    orgStatus: "done",
    blockers: [],
    ok: true,
    text: "Summary\n\nStatus: done",
    usage: null,
    usageLine: "usage: unavailable",
    costUsd: null,
    limit: null,
    errors: [],
    stderr: "",
    durationMs: 50
  });

  const orgState = JSON.parse(await readFile(join(session.dir, "org-state.json"), "utf8"));
  assert.equal(orgState.org.id, "software-team");
  assert.equal(orgState.phase, "done");
  assert.equal(orgState.roles.manager.status, "done");
  assert.equal(orgState.finalDecision.role, "manager");
});
