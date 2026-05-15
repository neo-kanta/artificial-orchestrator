import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDuet } from "../src/orchestrator.js";

test("flat runs stop and persist blocked status when a provider fails", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao blocked-run-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const calls = [];
  const session = await quietStdout(() =>
    runDuet({
      goal: "stop on missing credentials",
      workspace: root,
      project: { name: "demo", path: root, source: "workspace" },
      rounds: 2,
      apply: false,
      historyChars: 12000,
      providers: [
        { id: "reviewer", kind: "command", label: "Reviewer" },
        { id: "builder", kind: "command", label: "Builder" }
      ],
      callProvider: async (provider) => {
        calls.push(provider.id);
        return {
          ok: false,
          text: "Missing provider credentials.",
          usage: null,
          costUsd: null,
          limit: null,
          errors: ["missing credentials"],
          stderr: "",
          durationMs: 5
        };
      }
    })
  );

  assert.deepEqual(calls, ["reviewer"]);

  const status = JSON.parse(await readFile(join(session.dir, "status.json"), "utf8"));
  assert.equal(status.phase, "blocked");
  assert.equal(status.final.reason, "provider-blocked");
  assert.equal(status.final.provider, "reviewer");
  assert.match(status.blockers[0].blocker, /missing .*credentials/i);

  const providerState = JSON.parse(await readFile(join(session.dir, "provider-state.json"), "utf8"));
  assert.equal(providerState.phase, "blocked");
  assert.equal(providerState.final.provider, "reviewer");
});

test("flat runs stop and persist done status when a provider reports completion", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao done-run-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const calls = [];
  const session = await quietStdout(() =>
    runDuet({
      goal: "finish immediately",
      workspace: root,
      project: { name: "demo", path: root, source: "workspace" },
      rounds: 3,
      apply: false,
      historyChars: 12000,
      providers: [
        { id: "reviewer", kind: "command", label: "Reviewer" },
        { id: "builder", kind: "command", label: "Builder" }
      ],
      callProvider: async (provider) => {
        calls.push(provider.id);
        return {
          ok: true,
          text: "The requested work is complete.\n\nDUET_STATUS: done",
          usage: null,
          costUsd: null,
          limit: null,
          errors: [],
          stderr: "",
          durationMs: 5
        };
      }
    })
  );

  assert.deepEqual(calls, ["reviewer"]);

  const status = JSON.parse(await readFile(join(session.dir, "status.json"), "utf8"));
  assert.equal(status.phase, "done");
  assert.equal(status.final.reason, "provider-reported-done");
  assert.equal(status.final.provider, "reviewer");
});

test("flat runs stop on structured provider completion status", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao structured-done-run-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const calls = [];
  const session = await quietStdout(() =>
    runDuet({
      goal: "finish from json",
      workspace: root,
      project: { name: "demo", path: root, source: "workspace" },
      rounds: 3,
      apply: false,
      historyChars: 12000,
      providers: [
        { id: "planner", kind: "command", label: "Planner" },
        { id: "builder", kind: "command", label: "Builder" }
      ],
      callProvider: async (provider) => {
        calls.push(provider.id);
        return {
          ok: true,
          text: "Planner finished the requested work.",
          structured: {
            summary: "Done.",
            handoff: "No follow-up provider needed.",
            status: "done",
            blockers: [],
            filesSuggested: [],
            testsSuggested: []
          },
          usage: null,
          costUsd: null,
          limit: null,
          errors: [],
          stderr: "",
          durationMs: 5
        };
      }
    })
  );

  assert.deepEqual(calls, ["planner"]);

  const status = JSON.parse(await readFile(join(session.dir, "status.json"), "utf8"));
  assert.equal(status.phase, "done");
  assert.equal(status.final.reason, "provider-reported-done");
  assert.equal(status.final.provider, "planner");
});

test("runs reject missing workspaces before creating session state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao missing-workspace-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const missing = join(root, "missing");

  await assert.rejects(
    () =>
      quietStdout(() =>
        runDuet({
          goal: "do not create phantom workspaces",
          workspace: missing,
          project: { name: "missing", path: missing, source: "named" },
          rounds: 1,
          apply: false,
          historyChars: 12000,
          providers: [],
          callProvider: async () => {
            throw new Error("provider should not be called");
          }
        })
      ),
    /Workspace does not exist/
  );

  await assert.rejects(() => readFile(join(missing, ".duet", "latest"), "utf8"), /ENOENT/);
});

async function quietStdout(fn) {
  const oldLog = console.log;
  const oldWrite = process.stdout.write;
  console.log = () => {};
  process.stdout.write = (chunk, ...args) => {
    const callback = args.find((arg) => typeof arg === "function");
    callback?.();
    return true;
  };

  try {
    return await fn();
  } finally {
    console.log = oldLog;
    process.stdout.write = oldWrite;
  }
}
