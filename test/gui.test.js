import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { join, resolve } from "node:path";
import { appendTurn, createSession, finalizeSession } from "../src/logger.js";
import { addGuiProject, createGuiRunOptions, guiRunHistory, guiRunSnapshot, guiState, useGuiProject } from "../src/gui.js";
import { runAnalytics } from "../desktop/renderer/view.js";

test("gui state exposes projects and sanitized provider choices", async (t) => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  t.after(() => {
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  });

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
  assert.equal(local.id, "local");
  assert.equal(local.label, "Local Runner");
  assert.equal(local.kind, "command");
  assert.equal(local.role, "reviewer");
  assert.equal(local.model, null);
  assert.equal(local.configured, true);
  assert.deepEqual(local.readiness, {
    status: "unchecked",
    label: "External command",
    message: "Readiness is checked when the configured command starts."
  });

  const openai = state.providers.find((provider) => provider.id === "openai");
  assert.deepEqual(openai.readiness, {
    status: "blocked",
    label: "Missing OPENAI_API_KEY",
    message: "Set OPENAI_API_KEY before starting OpenAI-backed providers."
  });
  assert.doesNotMatch(JSON.stringify(state.providers), /do-not-render|secret-tool/);
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

test("gui run options can compose custom agent roles with model overrides", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao gui-custom-agents-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const registryPath = join(root, "projects.json");
  await addGuiProject({ name: "agents", path: workspace, registryPath });

  const options = await createGuiRunOptions({
    registryPath,
    projectName: "agents",
    goal: "coordinate custom specialists",
    rounds: 2,
    sharedContext: true,
    agentOrgLabel: "Desktop Custom Team",
    agentRoles: [
      {
        id: "research",
        label: "Research Lead",
        providerId: "openai",
        model: "gpt-research",
        responsibility: "Collect constraints and source context."
      },
      {
        id: "builder",
        label: "Builder",
        providerId: "codex",
        model: "gpt-builder",
        responsibility: "Implement the accepted plan."
      }
    ]
  });

  assert.equal(options.sharedContext, true);
  assert.equal(options.org.id, "desktop-custom-team");
  assert.equal(options.org.label, "Desktop Custom Team");
  assert.deepEqual(options.org.pipeline, ["research", "builder"]);
  assert.equal(options.org.roles[0].label, "Research Lead");
  assert.equal(options.org.roles[0].model, "gpt-research");
  assert.equal(options.org.roles[0].providerId, "openai");
  assert.equal(options.org.roles[1].kind, "codex");
  assert.equal(options.org.roles[1].model, "gpt-builder");
  assert.deepEqual(options.providers, []);
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
  assert.equal(snapshot.files.events, join(session.dir, "events.ndjson"));
  assert.equal(snapshot.agentMessages.length, 1);
  assert.equal(snapshot.agentMessages[0].agentId, "reviewer");
  assert.equal(snapshot.agentMessages[0].provider, "reviewer");
  assert.equal(snapshot.agentMessages[0].status, "blocked");
  assert.deepEqual(snapshot.agentMessages[0].blockers, ["missing credentials"]);
  assert.match(snapshot.agentMessages[0].handoff, /credentials need to be configured/);
  assert.equal(snapshot.recovery.title, "Run blocked");
  assert.equal(snapshot.recovery.severity, "danger");
  assert.equal(snapshot.recovery.summary, "reviewer stopped on: missing credentials");
  assert.equal(snapshot.recovery.nextSteps[0], "Resolve blocker: missing credentials");
  assert.deepEqual(
    snapshot.recovery.files.map((file) => file.key).slice(0, 4),
    ["providerState", "status", "handoff", "transcript"]
  );
});

test("gui state exposes recent runs and can load a selected session", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao gui-history-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const registryPath = join(root, "projects.json");
  await addGuiProject({ name: "history", path: workspace, registryPath });

  const first = await createSession(workspace, "review prior run", {
    project: { name: "history", path: resolve(workspace), source: "named" }
  });
  await appendTurn(first, {
    round: 1,
    provider: "codex",
    providerKind: "command",
    role: null,
    orgStatus: "continue",
    blockers: [],
    ok: true,
    text: "first private transcript detail\n\nHandoff: first private handoff detail",
    structured: null,
    usage: null,
    usageLine: "usage unavailable",
    costUsd: null,
    limit: null,
    errors: [],
    stderr: "",
    durationMs: 10
  });
  await finalizeSession(first, {
    status: "done",
    reason: "complete",
    provider: "codex",
    round: 1,
    blockers: []
  });

  await delay(5);

  const second = await createSession(workspace, "inspect latest blocker", {
    project: { name: "history", path: resolve(workspace), source: "named" }
  });
  await appendTurn(second, {
    round: 1,
    provider: "claude",
    providerKind: "command",
    role: null,
    orgStatus: "blocked",
    blockers: ["needs token"],
    ok: false,
    text: "second private transcript detail\n\nHandoff: second private handoff detail",
    structured: null,
    usage: null,
    usageLine: "usage unavailable",
    costUsd: null,
    limit: null,
    errors: [],
    stderr: "",
    durationMs: 10
  });
  await finalizeSession(second, {
    status: "blocked",
    reason: "provider-blocked",
    provider: "claude",
    round: 1,
    blockers: ["needs token"]
  });

  const history = await guiRunHistory(workspace, { historyLimit: 2 });
  assert.equal(history.length, 2);
  assert.equal(history[0].goal, "inspect latest blocker");
  assert.equal(history[0].phase, "blocked");
  assert.deepEqual(history[0].blockers, ["needs token"]);
  assert.equal(history[1].goal, "review prior run");
  assert.equal(history[1].phase, "done");
  assert.equal(Object.hasOwn(history[0], "transcript"), false);
  assert.equal(Object.hasOwn(history[0], "latestHandoff"), false);
  assert.doesNotMatch(JSON.stringify(history), /private transcript detail|private handoff detail/);

  const state = await guiState({ registryPath, historyLimit: 2 });
  assert.equal(state.run.id, history[0].id);
  assert.deepEqual(
    state.runHistory.map((run) => run.id),
    history.map((run) => run.id)
  );

  const priorSnapshot = await guiRunSnapshot(workspace, { sessionId: history[1].id });
  assert.equal(priorSnapshot.goal, "review prior run");
  assert.equal(priorSnapshot.phase, "done");
  assert.match(priorSnapshot.transcript, /first private transcript detail/);
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
  assert.deepEqual(
    snapshot.agentMessages.map((message) => [message.agentId, message.provider, message.providerId, message.status, message.round]),
    [
      ["manager", "manager", "openai", "continue", 1],
      ["reviewer", "reviewer", "claude", "blocked", 1]
    ]
  );
  assert.match(snapshot.agentMessages[0].text, /Internal manager summary/);
  assert.match(snapshot.agentMessages[1].handoff, /wait for approval/);
  assert.deepEqual(snapshot.agentMessages[1].blockers, ["missing approval"]);
  assert.equal(Object.hasOwn(snapshot, "orgState"), false);
  assert.doesNotMatch(JSON.stringify(snapshot.org), /Internal manager summary|Reviewer details|wait for approval/);
});

test("run analytics summarizes recent outcomes and current provider usage", () => {
  const selected = {
    id: "run-3",
    phase: "blocked",
    startedAt: "2026-06-05T08:00:00.000Z",
    updatedAt: "2026-06-05T08:07:00.000Z",
    blockers: ["missing token"],
    providers: [
      {
        id: "codex",
        usage: {
          input_tokens: 1200,
          output_tokens: 300
        }
      }
    ]
  };
  const history = [
    selected,
    {
      id: "run-2",
      phase: "done",
      startedAt: "2026-06-04T08:00:00.000Z",
      completedAt: "2026-06-04T08:03:00.000Z",
      blockers: []
    },
    {
      id: "run-1",
      phase: "rounds_exhausted",
      startedAt: "2026-06-03T08:00:00.000Z",
      completedAt: "2026-06-03T08:10:00.000Z",
      blockers: ["round limit"]
    }
  ];

  const analytics = runAnalytics(selected, history);

  assert.equal(analytics.total, 3);
  assert.equal(analytics.phaseCounts.blocked, 1);
  assert.equal(analytics.phaseCounts.done, 1);
  assert.equal(analytics.phaseCounts.rounds_exhausted, 1);
  assert.equal(analytics.metrics[1].value, "33%");
  assert.equal(analytics.metrics[2].value, "2");
  assert.equal(analytics.metrics[3].label, "Current tokens");
  assert.equal(analytics.metrics[3].value, "1.5k");
  assert.deepEqual(
    analytics.timeline.map((run) => run.id),
    ["run-1", "run-2", "run-3"]
  );
});
