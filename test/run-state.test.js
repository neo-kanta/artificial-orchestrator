import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendTurn, createSession, readProviderContext } from "../src/logger.js";

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
  assert.match(handoff, /Implemented project registry/);

  const providerState = JSON.parse(await readFile(join(session.dir, "provider-state.json"), "utf8"));
  assert.equal(providerState.providers.codex.ok, true);
  assert.equal(providerState.providers.codex.lastRound, 1);
  assert.equal(providerState.handoffs.length, 1);

  const status = JSON.parse(await readFile(join(session.dir, "status.json"), "utf8"));
  assert.equal(status.project.name, "demo");
  assert.equal(status.rounds[0].provider, "codex");
});
