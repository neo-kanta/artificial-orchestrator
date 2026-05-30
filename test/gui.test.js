import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { appendTurn, createSession, finalizeSession } from "../src/logger.js";
import { addGuiProject, createGuiRunOptions, guiRunSnapshot, guiState, useGuiProject } from "../src/gui.js";

test("gui state exposes projects and sanitized provider choices", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao gui-state-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const workspace = join(root, "workspace");
  await mkdir(workspace);
  await writeFile(
    join(workspace, "artificial-orchestrator.config.json"),
    JSON.stringify(
      {
        providers: {
          local: {
            label: "Local Runner",
            kind: "command",
            role: "reviewer",
            command: "secret-tool",
            env: {
              API_KEY: "do-not-render"
            }
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const registryPath = join(root, "projects.json");
  await addGuiProject({ name: "demo", path: workspace, registryPath });

  const state = await guiState({ registryPath });
  assert.equal(state.activeProject.name, "demo");
  assert.equal(state.workspace, resolve(workspace));
  const softwareTeam = state.orgs.find((org) => org.id === "software-team");
  assert.ok(softwareTeam);
  assert.deepEqual(
    softwareTeam.roles.slice(0, 3).map((role) => [role.id, role.provider]),
    [
      ["manager", "openai"],
      ["architect", "openai"],
      ["builder-claude", "claude"]
    ]
  );
  assert.deepEqual(softwareTeam.edges[0], {
    from: "manager",
    to: "architect",
    label: "manager -> architect"
  });

  const local = state.providers.find((provider) => provider.id === "local");
  assert.deepEqual(local, {
    id: "local",
    label: "Local Runner",
    kind: "command",
    role: "reviewer",
    model: null,
    configured: true
  });
  assert.doesNotMatch(JSON.stringify(state.providers), /do-not-render|secret-tool|API_KEY/);
});

test("gui run options validate launch input and reuse provider resolution", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao gui-run-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const registryPath = join(root, "projects.json");
  await addGuiProject({ name: "demo", path: workspace, registryPath });

  const options = await createGuiRunOptions({
    registryPath,
    projectName: "demo",
    goal: "inspect the workspace",
    providerIds: ["codex"],
    rounds: 3,
    apply: true,
    unsafe: true,
    claudeTools: true
  });

  assert.equal(options.workspace, resolve(workspace));
  assert.equal(options.project.name, "demo");
  assert.equal(options.rounds, 3);
  assert.equal(options.apply, true);
  assert.deepEqual(options.providers.map((provider) => provider.id), ["codex"]);
  assert.equal(options.providers[0].apply, true);
  assert.equal(options.providers[0].unsafe, true);

  const claudeOptions = await createGuiRunOptions({
    registryPath,
    projectName: "demo",
    goal: "review the workspace",
    providerIds: ["claude"],
    claudeTools: true
  });
  assert.equal(claudeOptions.providers[0].allowTools, true);

  await assert.rejects(
    () => createGuiRunOptions({ registryPath, projectName: "demo", goal: "", rounds: 1 }),
    /Enter a goal/
  );
  await assert.rejects(
    () => createGuiRunOptions({ registryPath, projectName: "demo", goal: "ship it", rounds: 99 }),
    /Rounds must/
  );
});

test("gui can switch projects and summarize durable run files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao gui-snapshot-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const alpha = join(root, "alpha");
  const beta = join(root, "beta");
  await mkdir(alpha);
  await mkdir(beta);
  const registryPath = join(root, "projects.json");
  await addGuiProject({ name: "alpha", path: alpha, registryPath });
  await addGuiProject({ name: "beta", path: beta, registryPath, setActive: false });

  const switched = await useGuiProject({ name: "beta", registryPath });
  assert.equal(switched.project.path, resolve(beta));

  const session = await createSession(beta, "finish the durable monitor", {
    project: { name: "beta", path: resolve(beta), source: "named" }
  });
  await appendTurn(session, {
    round: 1,
    provider: "reviewer",
    providerKind: "command",
    role: null,
    orgStatus: "blocked",
    blockers: ["missing credentials"],
    ok: false,
    text: "Handoff: credentials need to be configured.",
    structured: null,
    usage: null,
    usageLine: "usage unavailable",
    costUsd: null,
    limit: null,
    errors: [],
    stderr: "",
    durationMs: 10
  });
  await finalizeSession(session, {
    status: "blocked",
    reason: "provider-blocked",
    provider: "reviewer",
    round: 1,
    blockers: ["missing credentials"]
  });

  const snapshot = await guiRunSnapshot(beta);
  assert.equal(snapshot.phase, "blocked");
  assert.equal(snapshot.project.name, "beta");
  assert.match(snapshot.transcript, /finish the durable monitor/);
  assert.match(snapshot.latestHandoff, /credentials need to be configured/);
  assert.deepEqual(snapshot.blockers, ["missing credentials"]);
  assert.equal(snapshot.files.transcript, join(session.dir, "transcript.md"));
});

test("gui run snapshot exposes sanitized organization role progress", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao gui-org-snapshot-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const session = await createSession(workspace, "coordinate the release", {
    project: { name: "release", path: resolve(workspace), source: "named" },
    org: { id: "software-team", label: "Software Team", pipeline: ["manager", "reviewer", "docs"] }
  });

  await appendTurn(session, {
    round: 1,
    provider: "manager",
    providerId: "openai",
    providerKind: "openai",
    role: "manager",
    orgStatus: "continue",
    blockers: [],
    ok: true,
    text: "Internal manager summary should stay out of the public org projection.\n\nStatus: continue\n\nHandoff: reviewer should inspect the release.",
    structured: null,
    usage: null,
    usageLine: "usage unavailable",
    costUsd: null,
    limit: null,
    errors: [],
    stderr: "",
    durationMs: 10
  });

  await appendTurn(session, {
    round: 1,
    provider: "reviewer",
    providerId: "claude",
    providerKind: "claude",
    role: "reviewer",
    orgStatus: "blocked",
    blockers: ["missing approval"],
    ok: true,
    text: "Reviewer details should stay in the transcript.\n\nStatus: blocked\n\nHandoff: wait for approval.",
    structured: null,
    usage: null,
    usageLine: "usage unavailable",
    costUsd: null,
    limit: null,
    errors: [],
    stderr: "",
    durationMs: 10
  });

  await finalizeSession(session, {
    status: "blocked",
    reason: "organization-blocked",
    provider: "reviewer",
    round: 1,
    blockers: ["missing approval"]
  });

  const snapshot = await guiRunSnapshot(workspace);
  assert.equal(snapshot.phase, "blocked");
  assert.equal(snapshot.activeRole, "reviewer");
  assert.equal(snapshot.org.id, "software-team");
  assert.equal(snapshot.org.phase, "blocked");
  assert.deepEqual(
    snapshot.org.roles.map((role) => [role.id, role.status, role.lastRound]),
    [
      ["manager", "continue", 1],
      ["reviewer", "blocked", 1],
      ["docs", "pending", null]
    ]
  );
  assert.deepEqual(snapshot.org.roles[1].blockers, ["missing approval"]);
  assert.deepEqual(snapshot.org.blockers.map((entry) => [entry.role, entry.blocker]), [["reviewer", "missing approval"]]);
  assert.equal(Object.hasOwn(snapshot, "orgState"), false);
  assert.doesNotMatch(JSON.stringify(snapshot.org), /Internal manager summary|Reviewer details|wait for approval/);
});
