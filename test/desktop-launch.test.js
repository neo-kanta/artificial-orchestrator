import test from "node:test";
import assert from "node:assert/strict";
import { filterSessions, sessionTitle } from "../desktop/renderer/chat-view.js";
import { launchActionLabel, launchSteps, launchSummary, selectedProviderNotice, validateLaunch } from "../desktop/renderer/launch-state.js";
import { projectNameFromPath } from "../desktop/renderer/project-name.js";

const project = {
  name: "demo",
  path: "C:\\work\\demo"
};

const providers = [
  { id: "claude", label: "Claude", kind: "command", role: "architect" },
  { id: "codex", label: "Codex", kind: "command", role: "builder" }
];

const orgs = [
  {
    id: "software-team",
    label: "Software Team",
    roles: [{ id: "manager" }, { id: "builder" }]
  }
];

test("desktop launch validation reports actionable readiness errors", () => {
  const missing = validateLaunch(
    {
      goal: "",
      rounds: 0,
      providerIds: []
    },
    { project: null }
  );

  assert.equal(missing.ok, false);
  assert.deepEqual(missing.errors, [
    "Select a project before starting.",
    "Enter a goal before starting.",
    "Rounds must be a whole number from 1 to 20.",
    "Select at least one provider, custom agent, or organization preset."
  ]);

  const ready = validateLaunch(
    {
      goal: "Ship the desktop launcher",
      rounds: 2,
      providerIds: ["claude", "codex"]
    },
    { project }
  );

  assert.equal(ready.ok, true);
  assert.equal(ready.message, "Ready to start.");
});

test("desktop launch summary explains provider and permission choices", () => {
  const summary = launchSummary(
    {
      providerIds: ["claude", "codex"],
      rounds: 3,
      permissionPolicy: "workspace",
      claudeTools: false
    },
    { project, providers, orgs }
  );

  assert.deepEqual(
    summary.map((item) => [item.label, item.value, item.detail]),
    [
      ["Project", "demo", "C:\\work\\demo"],
      ["Providers", "Claude -> Codex", "Providers run in selected order."],
      ["Run shape", "3 rounds", "Applies changes inside the selected project."],
      ["Permissions", "Edit workspace", "Claude tools disabled."]
    ]
  );
});

test("desktop launch summary treats organization presets as the provider source", () => {
  const summary = launchSummary(
    {
      orgName: "software-team",
      providerIds: ["claude"],
      rounds: 1,
      permissionPolicy: "plan",
      claudeTools: true
    },
    { project, providers, orgs }
  );

  assert.equal(summary[1].label, "Organization");
  assert.equal(summary[1].value, "Software Team");
  assert.equal(summary[1].detail, "2 roles in preset order.");
  assert.equal(summary[2].value, "1 round");
  assert.equal(summary[3].detail, "Claude tools enabled.");
  assert.match(selectedProviderNotice({ orgName: "software-team" }), /locked/);
});

test("desktop launch validation blocks providers with readiness blockers", () => {
  const openai = {
    id: "openai",
    label: "OpenAI",
    readiness: {
      status: "blocked",
      label: "Missing OPENAI_API_KEY",
      message: "Set OPENAI_API_KEY before starting OpenAI-backed providers."
    }
  };
  const codex = {
    id: "codex",
    label: "Codex",
    readiness: {
      status: "unchecked",
      label: "Codex CLI auth",
      message: "Uses the local Codex CLI."
    }
  };

  const direct = validateLaunch(
    {
      goal: "Use OpenAI for the first turn",
      rounds: 1,
      providerIds: ["openai"]
    },
    { project, providers: [openai, codex] }
  );

  assert.equal(direct.ok, false);
  assert.deepEqual(direct.errors, ["OpenAI is not ready: Set OPENAI_API_KEY before starting OpenAI-backed providers."]);

  const org = validateLaunch(
    {
      goal: "Run the preset",
      rounds: 1,
      orgName: "software-team",
      providerIds: ["codex"]
    },
    {
      project,
      providers: [openai, codex],
      orgs: [
        {
          id: "software-team",
          label: "Software Team",
          roles: [
            { id: "manager", provider: "openai" },
            { id: "builder", provider: "codex" }
          ]
        }
      ]
    }
  );

  assert.equal(org.ok, false);
  assert.deepEqual(org.errors, ["OpenAI is not ready: Set OPENAI_API_KEY before starting OpenAI-backed providers."]);
});

test("desktop launch summary supports custom agent rosters", () => {
  const summary = launchSummary(
    {
      providerIds: [],
      rounds: 2,
      permissionPolicy: "plan",
      claudeTools: false
    },
    {
      project,
      providers,
      orgs,
      agentRoles: [
        { id: "research", label: "Research Lead" },
        { id: "builder", label: "Builder" }
      ]
    }
  );

  assert.equal(summary[1].label, "Custom agents");
  assert.equal(summary[1].value, "Research Lead -> Builder");
  assert.equal(summary[1].detail, "Custom roster controls role order and models.");

  const ready = validateLaunch(
    {
      goal: "Run custom agents",
      rounds: 2,
      providerIds: []
    },
    { project, agentRoles: [{ id: "research" }] }
  );
  assert.equal(ready.ok, true);
});

test("desktop launch checklist and action label point to the next missing setup step", () => {
  assert.equal(
    launchActionLabel(
      {
        goal: "",
        rounds: 2,
        providerIds: []
      },
      { project: null }
    ),
    "Select project"
  );

  assert.equal(
    launchActionLabel(
      {
        goal: "",
        rounds: 2,
        providerIds: ["codex"]
      },
      { project }
    ),
    "Enter goal"
  );

  const readyInput = {
    goal: "Ship a clearer launcher",
    rounds: 2,
    providerIds: ["codex"]
  };
  const steps = launchSteps(readyInput, { project, providers });
  assert.deepEqual(
    steps.map((step) => [step.label, step.status]),
    [
      ["Project", "done"],
      ["Goal", "done"],
      ["Team", "done"],
      ["Start", "done"]
    ]
  );
  assert.equal(launchActionLabel(readyInput, { project, providers }), "Start run");
  assert.equal(launchActionLabel(readyInput, { project, providers }, { activeRun: { workspace: project.path } }), "Run active");
});

test("desktop project browser infers a project name from the selected path", () => {
  assert.equal(projectNameFromPath("C:\\Users\\kanta\\source\\repos\\artificial-orchestrator"), "artificial-orchestrator");
  assert.equal(projectNameFromPath("C:\\Users\\kanta\\source\\repos\\ims-th-solution\\"), "ims-th-solution");
  assert.equal(projectNameFromPath("/home/kanta/work/demo"), "demo");
  assert.equal(projectNameFromPath(""), "");
});

test("desktop session view filters history and compacts titles", () => {
  const runs = [
    {
      id: "run-1",
      goal: "Review payment provider wiring",
      phase: "done",
      project: { name: "billing" },
      startedAt: "2026-06-18T10:00:00.000Z"
    },
    {
      id: "run-2",
      goal: "Fix hierarchy page controls",
      phase: "blocked",
      project: { name: "desktop" },
      org: { label: "Software Team" }
    }
  ];

  assert.deepEqual(
    filterSessions(runs, "hierarchy").map((run) => run.id),
    ["run-2"]
  );
  assert.deepEqual(
    filterSessions(runs, "billing").map((run) => run.id),
    ["run-1"]
  );
  assert.equal(sessionTitle({ goal: "  Ship   the   session   page  " }), "Ship the session page");
  assert.equal(sessionTitle({ goal: "A".repeat(60) }), `${"A".repeat(39)}...`);
});
