import { launchSummary, selectedProviderNotice, validateLaunch } from "./launch-state.js";

export function renderProjects(elements, projects, selectedProjectName, onSelectProject) {
  const project = selectProject(projects, selectedProjectName);
  elements.activeProjectLabel.textContent = project ? `${project.name} - ${project.path}` : "No active project";
  elements.projectList.replaceChildren();

  if (projects.length === 0) {
    elements.projectList.append(empty("No projects registered"));
    return;
  }

  for (const item of projects) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `project-row ${item.name === selectedProjectName ? "selected" : ""}`;
    row.addEventListener("click", () => onSelectProject(item));

    const name = document.createElement("span");
    name.className = "project-name";
    name.textContent = item.name;
    const path = document.createElement("span");
    path.className = "project-path";
    path.textContent = item.path;
    row.append(name, path);
    elements.projectList.append(row);
  }
}

export function renderLauncher(elements, project) {
  elements.workspaceTitle.textContent = project ? project.name : "Select a project";
}

export function renderProviderChoices(elements, providers, selectedProviderIds) {
  elements.providerList.replaceChildren();

  for (const provider of providers) {
    const label = document.createElement("label");
    label.className = "provider-choice";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = provider.id;
    input.checked = selectedProviderIds.length > 0 ? selectedProviderIds.includes(provider.id) : ["claude", "codex"].includes(provider.id);

    const copy = document.createElement("span");
    copy.className = "provider-copy";
    const text = document.createElement("span");
    text.textContent = provider.label;
    const meta = document.createElement("small");
    meta.textContent = providerMeta(provider);
    copy.append(text, meta);

    label.append(input, copy);
    elements.providerList.append(label);
  }

  renderProviderDisabledState(elements);
}

export function renderOrgChoices(elements, orgs) {
  const selected = elements.orgSelect.value;
  elements.orgSelect.replaceChildren(option("", "Provider pipeline"));
  for (const org of orgs) {
    elements.orgSelect.append(option(org.id, org.label));
  }
  elements.orgSelect.value = selected;
}

export function renderProviderDisabledState(elements) {
  const disabled = Boolean(elements.orgSelect.value);
  elements.providerNotice.textContent = selectedProviderNotice(launchInput(elements));
  for (const label of elements.providerList.querySelectorAll(".provider-choice")) {
    const input = label.querySelector("input");
    input.disabled = disabled;
    label.classList.toggle("disabled", disabled);
  }
}

export function renderLaunchReadiness(elements, input, context = {}, processState = {}) {
  const validation = validateLaunch(input, context);
  const activeRun = processState.activeRun ?? null;
  const isActive = Boolean(activeRun);

  elements.startButton.disabled = isActive || !validation.ok;
  elements.startButton.textContent = isActive ? "Run active" : "Start run";
  renderProcessBanner(elements, processState);
  renderSummary(elements, launchSummary(input, context));

  if (isActive) {
    setMessage(elements, "A run is active. Monitor is updating.");
  } else {
    setMessage(elements, validation.message, !validation.ok);
  }

  return validation;
}

const ROLE_STATUS_CLASSES = [
  "role-status-pending",
  "role-status-running",
  "role-status-continue",
  "role-status-done",
  "role-status-blocked",
  "role-status-unknown"
];

export function renderOrgMap(elements, org, selectedProviderIds, providers, runtimeState = null, activeRole = null) {
  const graph = org ? orgGraphFromPreset(org) : graphFromProviders(selectedProviderIds, providers);
  const roleStates = roleStateMap(runtimeState);
  elements.orgMapTitle.textContent = graph.title;
  elements.orgMapMeta.textContent = graph.meta;
  elements.orgGraph.replaceChildren();

  const nodeGrid = document.createElement("div");
  nodeGrid.className = "org-role-grid";
  for (const role of graph.roles) {
    const node = document.createElement("article");
    node.className = "org-role-node";
    node.dataset.role = role.id;

    const header = document.createElement("div");
    header.className = "org-role-header";
    const provider = document.createElement("span");
    provider.className = "org-role-provider";
    provider.textContent = role.provider;
    const status = document.createElement("span");
    status.className = "org-status-badge";
    status.dataset.roleStatus = "";
    header.append(provider, status);

    const label = document.createElement("strong");
    label.textContent = role.label;
    const responsibility = document.createElement("small");
    responsibility.textContent = role.responsibility || "Receives handoff and contributes to the run.";
    const runtime = document.createElement("small");
    runtime.className = "org-role-runtime";
    runtime.dataset.roleRuntime = "";
    const blocker = document.createElement("small");
    blocker.className = "org-role-blocker";
    blocker.dataset.roleBlocker = "";

    node.append(header, label, responsibility, runtime, blocker);
    setRoleRuntime(node, roleStates.get(role.id), role.id === activeRole);
    nodeGrid.append(node);
  }

  const flow = document.createElement("div");
  flow.className = "communication-flow";
  for (const [index, edge] of graph.edges.entries()) {
    const row = document.createElement("div");
    row.className = "communication-edge";
    row.style.setProperty("--edge-delay", `${index * 180}ms`);
    row.dataset.from = edge.from;
    row.dataset.to = edge.to;

    const from = document.createElement("span");
    from.textContent = edge.from;
    const line = document.createElement("span");
    line.className = "edge-line";
    const pulse = document.createElement("span");
    pulse.className = "edge-pulse";
    line.append(pulse);
    const to = document.createElement("span");
    to.textContent = edge.to;

    row.append(from, line, to);
    setEdgeRuntime(row, roleStates, activeRole);
    flow.append(row);
  }

  elements.orgGraph.append(nodeGrid, flow);
}

export function updateOrgActivity(elements, activeRole, runtimeState = null) {
  const roleStates = roleStateMap(runtimeState);
  for (const node of elements.orgGraph.querySelectorAll(".org-role-node")) {
    setRoleRuntime(node, roleStates.get(node.dataset.role), Boolean(activeRole) && node.dataset.role === activeRole);
  }
  for (const edge of elements.orgGraph.querySelectorAll(".communication-edge")) {
    setEdgeRuntime(edge, roleStates, activeRole);
  }
}

export function renderRun(elements, run, openPath) {
  const phase = run?.phase ?? "idle";
  elements.phaseBadge.textContent = phase;
  elements.phaseBadge.className = `phase-badge phase-${phase.replace(/_/g, "-")}`;
  elements.monitorTitle.textContent = run?.goal || "No durable run loaded";
  elements.runTimes.textContent = run ? compactTimes(run) : "";
  elements.transcriptView.textContent = run?.transcript ?? "";
  elements.handoffView.textContent = run?.latestHandoff || run?.handoff || "";

  renderStateList(elements, run?.providers ?? []);
  renderBlockers(elements, run?.blockers ?? []);
  renderFiles(elements, run?.files ?? {}, openPath);
  updateOrgActivity(elements, run?.activeRole ?? null, run?.org ?? null);
}

export function renderRunHistory(elements, runs = [], selectedRunId = null, onSelectRun) {
  elements.runHistory.replaceChildren();
  if (runs.length === 0) {
    elements.runHistory.append(empty("No recent runs"));
    return;
  }

  for (const run of runs) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `history-row ${run.id === selectedRunId ? "selected" : ""}`;
    row.addEventListener("click", () => onSelectRun(run));

    const main = document.createElement("span");
    main.className = "history-main";
    const goal = document.createElement("span");
    goal.className = "history-goal";
    goal.textContent = compactHistoryGoal(run.goal);
    const phase = document.createElement("span");
    phase.className = `history-phase phase-${String(run.phase ?? "unknown").replace(/_/g, "-")}`;
    phase.textContent = run.phase ?? "unknown";
    main.append(goal, phase);

    const meta = document.createElement("span");
    meta.className = "history-meta";
    meta.textContent = historyMeta(run);

    row.append(main, meta);
    elements.runHistory.append(row);
  }
}

export function selectedProject(projects, selectedProjectName, activeProject = null) {
  return selectProject(projects, selectedProjectName) ?? activeProject ?? null;
}

export function checkedProviderIds(elements) {
  return [...elements.providerList.querySelectorAll("input:checked")].map((input) => input.value);
}

export function launchInput(elements) {
  const permissionPolicy = selectedPermissionPolicy(elements);
  return {
    goal: elements.goalInput.value.trim(),
    orgName: elements.orgSelect.value,
    providerIds: checkedProviderIds(elements),
    rounds: Number(elements.roundsInput.value),
    permissionPolicy,
    apply: permissionPolicy === "workspace" || permissionPolicy === "trusted",
    unsafe: permissionPolicy === "trusted",
    claudeTools: elements.claudeToolsToggle.checked
  };
}

export function clearProjectForm(elements) {
  elements.projectName.value = "";
  elements.projectPath.value = "";
}

export function setMessage(elements, message, isError = false) {
  elements.validationMessage.textContent = message;
  elements.validationMessage.className = `validation-message ${isError ? "error" : ""}`;
}

function renderStateList(elements, providers) {
  elements.providerState.replaceChildren();
  if (providers.length === 0) {
    elements.providerState.append(empty("No provider state"));
    return;
  }

  for (const provider of providers) {
    const row = document.createElement("div");
    row.className = "state-row";
    const dot = document.createElement("span");
    dot.className = `state-dot state-${provider.state}`;
    const label = document.createElement("span");
    label.textContent = provider.id;
    const meta = document.createElement("span");
    meta.textContent = provider.limit ? `limit reset ${provider.limit.reset}` : provider.lastRound ? `round ${provider.lastRound}` : provider.state;
    row.append(dot, label, meta);
    elements.providerState.append(row);
  }
}

function renderBlockers(elements, blockers) {
  elements.blockerList.replaceChildren();
  if (blockers.length === 0) {
    elements.blockerList.append(empty("No blockers"));
    return;
  }

  for (const blocker of blockers) {
    const item = document.createElement("div");
    item.className = "blocker";
    item.textContent = blocker;
    elements.blockerList.append(item);
  }
}

function renderFiles(elements, files, openPath) {
  elements.fileList.replaceChildren();
  const entries = [
    ["transcript", files.transcript],
    ["status", files.status],
    ["handoff", files.handoff],
    ["provider state", files.providerState],
    ["org state", files.orgState]
  ].filter((entry) => entry[1]);

  if (entries.length === 0) {
    elements.fileList.append(empty("No files"));
    return;
  }

  for (const [label, path] of entries) {
    const row = document.createElement("div");
    row.className = "file-row";
    const text = document.createElement("span");
    text.textContent = path;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost-button";
    button.textContent = label;
    button.addEventListener("click", () => openPath(path));
    row.append(button, text);
    elements.fileList.append(row);
  }
}

function renderProcessBanner(elements, processState = {}) {
  const activeRun = processState.activeRun ?? null;
  const lastRunError = processState.lastRunError ?? null;
  elements.processBanner.hidden = !activeRun && !lastRunError;

  if (activeRun) {
    const project = activeRun.project?.name ?? activeRun.workspace;
    elements.processBanner.className = "process-banner running";
    elements.processBanner.textContent = `Running ${project} since ${activeRun.startedAt}.`;
    return;
  }

  if (lastRunError) {
    elements.processBanner.className = "process-banner error";
    elements.processBanner.textContent = `Last run failed: ${firstLine(lastRunError.message)}`;
  }
}

function renderSummary(elements, items) {
  elements.launchSummaryList.replaceChildren();
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "summary-row";
    const label = document.createElement("span");
    label.className = "summary-label";
    label.textContent = item.label;
    const body = document.createElement("span");
    body.className = "summary-body";
    const value = document.createElement("strong");
    value.textContent = item.value;
    const detail = document.createElement("small");
    detail.textContent = item.detail;
    body.append(value, detail);
    row.append(label, body);
    elements.launchSummaryList.append(row);
  }
}

function providerMeta(provider) {
  return [
    provider.kind,
    provider.role && provider.role !== "provider" ? provider.role : null,
    provider.model,
    provider.configured ? "configured" : null
  ]
    .filter(Boolean)
    .join(" | ");
}

function orgGraphFromPreset(org) {
  return {
    title: org.label,
    meta: `${org.roles.length} roles | ${org.edges.length} handoff paths`,
    roles: org.roles,
    edges: org.edges
  };
}

function graphFromProviders(selectedProviderIds, providers) {
  const selected = selectedProviderIds.length > 0 ? selectedProviderIds : ["claude", "codex"];
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const roles = selected.map((id) => {
    const provider = providerById.get(id) ?? { id, label: id, kind: "provider", role: "provider" };
    return {
      id,
      label: provider.label,
      provider: provider.kind,
      responsibility: provider.role
    };
  });
  return {
    title: "Provider pipeline",
    meta: `${roles.length} providers | ${Math.max(0, roles.length - 1)} handoff paths`,
    roles,
    edges: roles.slice(0, -1).map((role, index) => ({
      from: role.id,
      to: roles[index + 1].id,
      label: `${role.id} -> ${roles[index + 1].id}`
    }))
  };
}

function selectedPermissionPolicy(elements) {
  if (elements.permissionTrusted.checked) return "trusted";
  if (elements.permissionWorkspace.checked) return "workspace";
  return "plan";
}

function roleStateMap(runtimeState) {
  return new Map((runtimeState?.roles ?? []).map((role) => [role.id, role]));
}

function setRoleRuntime(node, roleState, isActive) {
  const runtime = roleRuntime(roleState, isActive);
  node.classList.remove("active", ...ROLE_STATUS_CLASSES);
  node.classList.add(`role-status-${runtime.status}`);
  node.classList.toggle("active", isActive);
  node.dataset.status = runtime.status;

  const badge = node.querySelector("[data-role-status]");
  if (badge) {
    badge.className = `org-status-badge role-status-${runtime.status}`;
    badge.textContent = runtime.label;
  }

  const runtimeLine = node.querySelector("[data-role-runtime]");
  if (runtimeLine) runtimeLine.textContent = runtime.meta;

  const blockerLine = node.querySelector("[data-role-blocker]");
  if (blockerLine) {
    blockerLine.textContent = runtime.blocker;
    blockerLine.hidden = !runtime.blocker;
  }
}

function setEdgeRuntime(edge, roleStates, activeRole) {
  const fromState = roleStates.get(edge.dataset.from);
  const active = Boolean(activeRole) && edge.dataset.to === activeRole;
  const complete = roleHasRun(fromState);
  edge.classList.toggle("active", active);
  edge.classList.toggle("complete", complete);
}

function roleRuntime(roleState, isActive) {
  const rawStatus = normalizeRoleStatus(roleState?.status ?? (roleState ? "unknown" : "pending"));
  const status = isActive && rawStatus === "pending" ? "running" : rawStatus;
  const round = roleState?.lastRound ? `round ${roleState.lastRound}` : null;
  const blocker = roleState?.blockers?.[0] ?? "";
  return {
    status,
    label: statusLabel(status),
    meta: roleMeta(status, round),
    blocker
  };
}

function roleMeta(status, round) {
  if (round && status === "blocked") return `blocked at ${round}`;
  if (round && status === "done") return `finished at ${round}`;
  if (round && status === "continue") return `completed ${round}`;
  if (round) return round;
  if (status === "running") return "active handoff";
  if (status === "pending") return "waiting for turn";
  return "state unavailable";
}

function roleHasRun(roleState) {
  return Boolean(roleState?.lastRound) || ["continue", "done", "blocked"].includes(roleState?.status);
}

function normalizeRoleStatus(status) {
  const value = String(status ?? "unknown").toLowerCase().replace(/_/g, "-");
  if (["pending", "running", "continue", "done", "blocked"].includes(value)) return value;
  return "unknown";
}

function statusLabel(status) {
  return status === "continue" ? "continue" : status;
}

function selectProject(projects, selectedProjectName) {
  return projects.find((project) => project.name === selectedProjectName) ?? null;
}

function compactTimes(run) {
  return [run.startedAt ? `started ${run.startedAt}` : null, run.updatedAt ? `updated ${run.updatedAt}` : null, run.completedAt ? `completed ${run.completedAt}` : null]
    .filter(Boolean)
    .join(" | ");
}

function firstLine(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .find(Boolean) ?? "Unknown error.";
}

function option(value, label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function empty(text) {
  const node = document.createElement("div");
  node.className = "empty-note";
  node.textContent = text;
  return node;
}

function compactHistoryGoal(goal) {
  const value = String(goal ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "(no goal)";
  return value.length > 90 ? `${value.slice(0, 87)}...` : value;
}

function historyMeta(run) {
  const blockers = run.blockers?.length ? `${run.blockers.length} ${run.blockers.length === 1 ? "blocker" : "blockers"}` : null;
  return [
    run.project?.name ?? null,
    run.org?.label ?? run.org?.id ?? null,
    run.startedAt ? `started ${run.startedAt}` : run.updatedAt ? `updated ${run.updatedAt}` : null,
    blockers
  ]
    .filter(Boolean)
    .join(" | ");
}
