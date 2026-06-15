import test from "node:test";
import assert from "node:assert/strict";
import { recoveryCenterForRun } from "../src/domain/recovery.js";

const files = {
  transcript: "C:\\work\\.duet\\sessions\\1\\transcript.md",
  status: "C:\\work\\.duet\\sessions\\1\\status.json",
  handoff: "C:\\work\\.duet\\sessions\\1\\handoff.md",
  providerState: "C:\\work\\.duet\\sessions\\1\\provider-state.json",
  orgState: "C:\\work\\.duet\\sessions\\1\\org-state.json"
};

test("recovery center gives blocked runs actionable next steps and file priority", () => {
  const recovery = recoveryCenterForRun({
    phase: "blocked",
    blockers: ["missing credentials"],
    providers: [{ id: "reviewer", ok: false, state: "blocked" }],
    latestHandoff: "Configure the provider token before retrying.",
    files
  });

  assert.equal(recovery.severity, "danger");
  assert.equal(recovery.title, "Run blocked");
  assert.equal(recovery.summary, "reviewer stopped on: missing credentials");
  assert.deepEqual(recovery.nextSteps.slice(0, 2), [
    "Resolve blocker: missing credentials",
    "Open provider-state.json to inspect provider limits, auth, usage, and last handoff."
  ]);
  assert.deepEqual(
    recovery.files.map((file) => file.key),
    ["providerState", "status", "handoff", "transcript", "orgState"]
  );
});

test("recovery center guides round-limit follow-up without inventing resume behavior", () => {
  const recovery = recoveryCenterForRun({
    phase: "rounds_exhausted",
    blockers: [],
    latestHandoff: "Builder should finish the tests.",
    files
  });

  assert.equal(recovery.severity, "warning");
  assert.equal(recovery.title, "Round limit reached");
  assert.match(recovery.nextSteps[0], /handoff\.md/);
  assert.match(recovery.nextSteps[1], /Increase rounds|follow-up/);
  assert.deepEqual(
    recovery.files.map((file) => file.key).slice(0, 3),
    ["handoff", "transcript", "status"]
  );
});

test("recovery center has an idle state for no loaded run", () => {
  const recovery = recoveryCenterForRun(null);

  assert.equal(recovery.phase, "idle");
  assert.equal(recovery.title, "No run loaded");
  assert.deepEqual(recovery.files, []);
});
