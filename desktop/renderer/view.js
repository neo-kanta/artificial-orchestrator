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

export function renderAgentRoles(elements, roles, providers, onChange, onAdd, onRemove) {
  elements.agentRoleList.replaceChildren();
  elements.addAgentButton.onclick = onAdd;

  if (roles.length === 0) {
    elements.agentRoleList.append(empty("No agents selected"));
    return;
  }

  for (const [index, role] of roles.entries()) {
    const row = document.createElement("div");
    row.className = "agent-role-row";
    row.dataset.roleIndex = String(index);

    const roleLabel = document.createElement("label");
    roleLabel.textContent = "Role";
    const roleInput = document.createElement("input");
    roleInput.value = role.label ?? role.id ?? "";
    roleInput.dataset.agentField = "label";
    roleInput.placeholder = "reviewer";
    roleLabel.append(roleInput);

    const providerLabel = document.createElement("label");
    providerLabel.textContent = "Agent";
    const providerSelect = document.createElement("select");
    providerSelect.dataset.agentField = "providerId";
    for (const provider of providers) {
      providerSelect.append(option(provider.id, provider.label ?? provider.id));
    }
    providerSelect.value = role.providerId ?? role.provider ?? providers[0]?.id ?? "";
    providerLabel.append(providerSelect);

    const modelLabel = document.createElement("label");
    modelLabel.textContent = "Model";
    const modelInput = document.createElement("input");
    modelInput.value = role.model ?? "";
    modelInput.dataset.agentField = "model";
    modelInput.placeholder = modelPlaceholder(providerSelect.value, providers);
    modelLabel.append(modelInput);

    const responsibilityLabel = document.createElement("label");
    responsibilityLabel.className = "agent-responsibility";
    responsibilityLabel.textContent = "Responsibility";
    const responsibilityInput = document.createElement("input");
    responsibilityInput.value = role.responsibility ?? "";
    responsibilityInput.dataset.agentField = "responsibility";
    responsibilityInput.placeholder = "What this role should decide or do";
    responsibilityLabel.append(responsibilityInput);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost-button agent-remove-button";
    removeButton.textContent = "Remove";
    removeButton.disabled = roles.length === 1;
    removeButton.addEventListener("click", () => onRemove(index));

    const update = () => onChange(readAgentRoles(elements, roles));
    roleInput.addEventListener("input", update);
    modelInput.addEventListener("input", update);
    responsibilityInput.addEventListener("input", update);
    providerSelect.addEventListener("change", () => {
      modelInput.placeholder = modelPlaceholder(providerSelect.value, providers);
      update();
    });

    row.append(roleLabel, providerLabel, modelLabel, responsibilityLabel, removeButton);
    elements.agentRoleList.append(row);
  }
}

export function readAgentRoles(elements, existingRoles = []) {
  return [...elements.agentRoleList.querySelectorAll(".agent-role-row")].map((row) => {
    const index = Number(row.dataset.roleIndex);
    const existing = existingRoles[index] ?? {};
    return {
      ...existing,
      label: row.querySelector('[data-agent-field="label"]')?.value.trim() ?? existing.label ?? "",
      providerId: row.querySelector('[data-agent-field="providerId"]')?.value ?? existing.providerId ?? "",
      model: row.querySelector('[data-agent-field="model"]')?.value.trim() ?? "",
      responsibility: row.querySelector('[data-agent-field="responsibility"]')?.value.trim() ?? ""
    };
  });
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
    const arrow = document.createElement("span");
    arrow.className = "edge-arrow";
    arrow.textContent = "->";
    line.append(pulse, arrow);
    const to = document.createElement("span");
    to.textContent = edge.to;
    const chat = document.createElement("span");
    chat.className = "edge-chat";
    chat.dataset.edgeChat = "";

    row.append(from, line, to, chat);
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

  renderRecovery(elements, run?.recovery ?? null, openPath);
  renderStateList(elements, run?.providers ?? []);
  renderBlockers(elements, run?.blockers ?? []);
  renderFiles(elements, run?.files ?? {}, openPath);
  updateOrgActivity(elements, run?.activeRole ?? null, run?.org ?? null);
}

export function renderAgentChat(elements, run, selectedAgentId = null, onSelectAgent = () => {}) {
  const agents = agentChatAgents(run);
  const activeAgent = selectAgentChatAgent(agents, run, selectedAgentId);

  elements.agentChatList.replaceChildren();
  elements.agentChatThread.replaceChildren();

  if (!run) {
    elements.agentChatTitle.textContent = "No run loaded";
    elements.agentChatMeta.textContent = "";
    elements.agentChatList.append(empty("Start or load a run to see agent conversations."));
    elements.agentChatThread.append(empty("Agent messages will appear here."));
    return null;
  }

  if (!activeAgent) {
    elements.agentChatTitle.textContent = "No agent messages yet";
    elements.agentChatMeta.textContent = "Waiting for the first turn";
    elements.agentChatList.append(empty("Agents appear after the run starts."));
    elements.agentChatThread.append(empty("The selected agent thread will appear here."));
    return null;
  }

  elements.agentChatTitle.textContent = activeAgent.label;
  elements.agentChatMeta.textContent = agentChatMeta(activeAgent);

  for (const agent of agents) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `agent-chat-agent ${agent.id === activeAgent.id ? "selected" : ""}`;
    button.addEventListener("click", () => onSelectAgent(agent.id));

    const main = document.createElement("span");
    main.className = "agent-chat-agent-main";
    const label = document.createElement("strong");
    label.textContent = agent.label;
    const meta = document.createElement("span");
    meta.textContent = agentProviderLine(agent);
    main.append(label, meta);

    const status = document.createElement("span");
    status.className = `agent-chat-status ${agentStatusClass(agent.status)}`;
    status.textContent = agentStatusLabel(agent.status);

    const count = document.createElement("span");
    count.className = "agent-chat-count";
    count.textContent = `${agent.messages.length} ${agent.messages.length === 1 ? "turn" : "turns"}`;

    button.append(main, status, count);
    elements.agentChatList.append(button);
  }

  if (activeAgent.messages.length === 0) {
    elements.agentChatThread.append(empty("This agent has not spoken in the selected run yet."));
    return activeAgent.id;
  }

  for (const message of activeAgent.messages) {
    elements.agentChatThread.append(agentMessageNode(message));
  }

  return activeAgent.id;
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

const PHASE_ORDER = ["done", "running", "blocked", "rounds_exhausted", "unknown"];
const PHASE_LABELS = {
  done: "Done",
  running: "Running",
  blocked: "Blocked",
  rounds_exhausted: "Rounds exhausted",
  unknown: "Unknown"
};

export function renderRunVisualization(elements, run, runs = [], selectedRunId = null, onSelectRun = () => {}) {
  const analytics = runAnalytics(run, runs);

  elements.runVisualizationTitle.textContent = analytics.title;
  elements.runVisualizationMeta.textContent = analytics.meta;
  renderMetricStrip(elements.runMetrics, analytics.metrics);
  renderPhaseMix(elements.phaseMixBar, elements.phaseMixLegend, analytics);
  renderTimeline(elements.runTimeline, analytics, selectedRunId, onSelectRun);
}

export function runAnalytics(run, runs = []) {
  const recentRuns = uniqueRuns(run, runs);
  const total = recentRuns.length;
  const phaseCounts = Object.fromEntries(PHASE_ORDER.map((phase) => [phase, 0]));
  let blockerCount = 0;
  let providerCount = 0;
  let tokenTotal = 0;
  const durations = [];

  for (const item of recentRuns) {
    phaseCounts[normalizePhase(item.phase)] += 1;
    blockerCount += Array.isArray(item.blockers) ? item.blockers.length : 0;
    const duration = runDurationMs(item);
    if (duration !== null) durations.push(duration);
  }

  for (const provider of run?.providers ?? []) {
    providerCount += 1;
    tokenTotal += providerTokenTotal(provider);
  }

  const completed = phaseCounts.done;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  const averageDuration = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;
  const maxDuration = durations.length ? Math.max(...durations) : 0;

  return {
    title: analyticsTitle(run, phaseCounts, total),
    meta: analyticsMeta(total, run),
    metrics: [
      { label: "Recent runs", value: String(total), detail: total === 1 ? "session" : "sessions" },
      { label: "Completion", value: total ? `${completionRate}%` : "-", detail: `${completed} done` },
      { label: "Blockers", value: String(blockerCount), detail: blockerCount === 1 ? "recorded blocker" : "recorded blockers" },
      {
        label: tokenTotal > 0 ? "Current tokens" : "Current providers",
        value: tokenTotal > 0 ? compactNumber(tokenTotal) : String(providerCount),
        detail: tokenTotal > 0 ? "reported usage" : providerCount === 1 ? "provider" : "providers"
      }
    ],
    phaseCounts,
    total,
    timeline: recentRuns
      .slice()
      .reverse()
      .map((item) => ({
        ...item,
        phase: normalizePhase(item.phase),
        durationMs: runDurationMs(item)
      })),
    maxDuration,
    averageDuration
  };
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
    claudeTools: elements.claudeToolsToggle.checked,
    sharedContext: elements.sharedContextToggle.checked
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

function renderRecovery(elements, recovery, openPath) {
  const state = recovery ?? {
    severity: "neutral",
    title: "No run loaded",
    summary: "Start or load a run to see next actions.",
    nextSteps: ["Select a project, enter a goal, and start a run."],
    files: []
  };

  elements.recoveryStatus.className = `recovery-status recovery-${state.severity ?? "neutral"}`;
  elements.recoveryTitle.textContent = state.title ?? "Run state";
  elements.recoverySummary.textContent = state.summary ?? "";
  elements.recoveryActions.replaceChildren();

  const nextSteps = Array.isArray(state.nextSteps) ? state.nextSteps.filter(Boolean) : [];
  if (nextSteps.length > 0) {
    const group = document.createElement("div");
    group.className = "recovery-action-group";
    const label = document.createElement("span");
    label.className = "recovery-group-label";
    label.textContent = "Next actions";
    const list = document.createElement("ol");
    list.className = "recovery-step-list";
    for (const step of nextSteps) {
      const item = document.createElement("li");
      item.textContent = step;
      list.append(item);
    }
    group.append(label, list);
    elements.recoveryActions.append(group);
  }

  const files = Array.isArray(state.files) ? state.files.filter((file) => file?.path) : [];
  if (files.length > 0) {
    const group = document.createElement("div");
    group.className = "recovery-action-group";
    const label = document.createElement("span");
    label.className = "recovery-group-label";
    label.textContent = "Priority files";
    group.append(label);

    for (const file of files) {
      const row = document.createElement("div");
      row.className = "recovery-file-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ghost-button";
      button.textContent = file.label ?? file.key ?? "Open";
      button.addEventListener("click", () => openPath(file.path));
      const detail = document.createElement("span");
      detail.textContent = file.detail ?? file.path;
      row.append(button, detail);
      group.append(row);
    }

    elements.recoveryActions.append(group);
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
    ["events", files.events],
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
  return [provider.kind, provider.role && provider.role !== "provider" ? provider.role : null, provider.model, provider.configured ? "configured" : null]
    .filter(Boolean)
    .join(" | ");
}

function agentChatAgents(run) {
  if (!run) return [];
  const agents = new Map();
  const ordered = [];

  const ensure = (id, seed = {}) => {
    const safeId = String(id ?? seed.id ?? "").trim();
    if (!safeId) return null;
    const existing = agents.get(safeId);
    if (existing) {
      Object.assign(existing, cleanAgentSeed(seed, existing));
      return existing;
    }

    const agent = {
      id: safeId,
      label: seed.label || titleCase(safeId),
      provider: seed.provider ?? "",
      providerId: seed.providerId ?? "",
      providerKind: seed.providerKind ?? "",
      status: normalizeAgentStatus(seed.status ?? "pending"),
      lastRound: seed.lastRound ?? null,
      lastAt: seed.lastAt ?? null,
      messages: []
    };
    agents.set(safeId, agent);
    ordered.push(agent);
    return agent;
  };

  for (const role of run.org?.roles ?? []) {
    ensure(role.id, {
      label: titleCase(role.id),
      provider: role.provider ?? "",
      status: role.status ?? "pending",
      lastRound: role.lastRound ?? null,
      lastAt: role.lastAt ?? null
    });
  }

  for (const provider of run.providers ?? []) {
    ensure(provider.id, {
      label: provider.id,
      provider: provider.id,
      status: provider.state === "ok" ? "continue" : provider.state,
      lastRound: provider.lastRound ?? null,
      lastAt: provider.lastAt ?? null
    });
  }

  for (const message of run.agentMessages ?? []) {
    const id = String(message.agentId ?? message.role ?? message.provider ?? message.providerId ?? "").trim();
    const agent = ensure(id, {
      label: message.speaker ? titleCase(message.speaker) : titleCase(id),
      provider: message.provider ?? "",
      providerId: message.providerId ?? "",
      providerKind: message.providerKind ?? "",
      status: message.status,
      lastRound: message.round,
      lastAt: message.at
    });
    if (!agent) continue;
    agent.messages.push(message);
    agent.status = normalizeAgentStatus(message.status ?? agent.status);
    agent.lastRound = message.round ?? agent.lastRound;
    agent.lastAt = message.at ?? agent.lastAt;
    agent.provider ||= message.provider ?? "";
    agent.providerId ||= message.providerId ?? "";
    agent.providerKind ||= message.providerKind ?? "";
  }

  return ordered;
}

function cleanAgentSeed(seed, existing) {
  return Object.fromEntries(
    Object.entries({
      label: seed.label || existing.label,
      provider: seed.provider || existing.provider,
      providerId: seed.providerId || existing.providerId,
      providerKind: seed.providerKind || existing.providerKind,
      status: seed.status ? normalizeAgentStatus(seed.status) : existing.status,
      lastRound: seed.lastRound ?? existing.lastRound,
      lastAt: seed.lastAt ?? existing.lastAt
    }).filter((entry) => entry[1] !== undefined && entry[1] !== null)
  );
}

function selectAgentChatAgent(agents, run, selectedAgentId) {
  if (agents.length === 0) return null;
  const selected = agents.find((agent) => agent.id === selectedAgentId);
  if (selected) return selected;

  const active = agents.find((agent) => agent.id === run?.activeRole);
  if (active) return active;

  const lastMessageAgentId = run?.agentMessages?.at(-1)?.agentId;
  return agents.find((agent) => agent.id === lastMessageAgentId) ?? agents[0];
}

function agentMessageNode(message) {
  const item = document.createElement("article");
  item.className = `agent-message ${agentStatusClass(message.status)}`;

  const head = document.createElement("div");
  head.className = "agent-message-head";
  const round = document.createElement("strong");
  round.textContent = message.round ? `Round ${message.round}` : "Round unavailable";
  const status = document.createElement("span");
  status.className = `agent-chat-status ${agentStatusClass(message.status)}`;
  status.textContent = agentStatusLabel(message.status);
  head.append(round, status);

  const body = document.createElement("pre");
  body.className = "agent-message-body";
  body.textContent = message.text || "(no output)";

  item.append(head, body);

  const blockers = Array.isArray(message.blockers) ? message.blockers.filter(Boolean) : [];
  if (blockers.length > 0) {
    const blockerList = document.createElement("div");
    blockerList.className = "agent-message-blockers";
    for (const blocker of blockers) {
      const blockerNode = document.createElement("span");
      blockerNode.textContent = blocker;
      blockerList.append(blockerNode);
    }
    item.append(blockerList);
  }

  if (message.handoff && message.handoff !== message.text) {
    const handoff = document.createElement("details");
    handoff.className = "agent-message-handoff";
    const summary = document.createElement("summary");
    summary.textContent = "Handoff";
    const text = document.createElement("div");
    text.textContent = message.handoff;
    handoff.append(summary, text);
    item.append(handoff);
  }

  const meta = document.createElement("div");
  meta.className = "agent-message-meta";
  meta.textContent = messageMeta(message);
  item.append(meta);

  return item;
}

function agentChatMeta(agent) {
  const parts = [
    agent.messages.length === 1 ? "1 turn" : `${agent.messages.length} turns`,
    agent.lastRound ? `last round ${agent.lastRound}` : null,
    agent.lastAt ? `updated ${timeLabel(agent.lastAt)}` : null
  ].filter(Boolean);
  return parts.join(" | ");
}

function agentProviderLine(agent) {
  return uniqueParts([agent.providerKind, agent.providerId, agent.provider]).join(" | ") || "agent";
}

function messageMeta(message) {
  return [
    ...uniqueParts([message.providerKind, message.providerId, message.provider]),
    message.at ? timeLabel(message.at) : null,
    message.durationMs !== null && message.durationMs !== undefined ? formatDuration(message.durationMs) : null,
    message.usageLine || null,
    message.limit?.reset ? `limit reset ${message.limit.reset}` : null
  ]
    .filter(Boolean)
    .join(" | ");
}

function uniqueParts(parts) {
  const seen = new Set();
  return parts
    .map((part) => String(part ?? "").trim())
    .filter((part) => {
      if (!part || seen.has(part)) return false;
      seen.add(part);
      return true;
    });
}

function normalizeAgentStatus(status) {
  const value = String(status ?? "unknown").toLowerCase().replace(/_/g, "-");
  if (["pending", "continue", "done", "blocked", "running"].includes(value)) return value;
  if (value === "ok") return "continue";
  return "unknown";
}

function agentStatusClass(status) {
  return `agent-status-${normalizeAgentStatus(status)}`;
}

function agentStatusLabel(status) {
  const normalized = normalizeAgentStatus(status);
  if (normalized === "continue") return "continue";
  return normalized;
}

function timeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
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
  const chat = edge.querySelector("[data-edge-chat]");
  if (chat) chat.textContent = active ? "talking now" : complete ? "handoff sent" : "queued";
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

function modelPlaceholder(providerId, providers) {
  const provider = providers.find((item) => item.id === providerId);
  if (provider?.model) return provider.model;
  if (provider?.kind === "codex") return "gpt-5.4-mini";
  if (provider?.kind === "openai") return "gpt-5.5";
  if (provider?.kind === "claude") return "default";
  return "model";
}

function titleCase(value) {
  return String(value ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
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

function renderMetricStrip(container, metrics) {
  container.replaceChildren();
  for (const metric of metrics) {
    const item = document.createElement("div");
    item.className = "viz-metric";

    const label = document.createElement("span");
    label.className = "viz-metric-label";
    label.textContent = metric.label;

    const value = document.createElement("strong");
    value.textContent = metric.value;

    const detail = document.createElement("span");
    detail.className = "viz-metric-detail";
    detail.textContent = metric.detail;

    item.append(label, value, detail);
    container.append(item);
  }
}

function renderPhaseMix(bar, legend, analytics) {
  bar.replaceChildren();
  legend.replaceChildren();

  if (analytics.total === 0) {
    bar.className = "phase-mix-bar empty";
    bar.textContent = "No run history";
    bar.removeAttribute("role");
    bar.removeAttribute("aria-label");
    legend.append(empty("Run outcomes will appear here after the first session."));
    return;
  }

  bar.className = "phase-mix-bar";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", phaseMixLabel(analytics.phaseCounts));

  for (const phase of PHASE_ORDER) {
    const count = analytics.phaseCounts[phase];
    if (!count) continue;
    const share = Math.round((count / analytics.total) * 100);
    const segment = document.createElement("span");
    segment.className = `phase-segment ${phaseClass(phase)}`;
    segment.style.flexGrow = String(count);
    segment.textContent = segmentLabel(phase, count, share);
    segment.title = `${PHASE_LABELS[phase]}: ${count} of ${analytics.total}`;
    bar.append(segment);
  }

  for (const phase of PHASE_ORDER) {
    const count = analytics.phaseCounts[phase];
    if (!count) continue;

    const item = document.createElement("span");
    item.className = "phase-key";
    const swatch = document.createElement("span");
    swatch.className = `phase-swatch ${phaseClass(phase)}`;
    const text = document.createElement("span");
    text.textContent = `${PHASE_LABELS[phase]}: ${count}`;
    item.append(swatch, text);
    legend.append(item);
  }
}

function renderTimeline(container, analytics, selectedRunId, onSelectRun) {
  container.replaceChildren();

  const title = document.createElement("div");
  title.className = "timeline-title";
  title.textContent = analytics.averageDuration === null ? "Timeline appears after runs finish" : `Average duration ${formatDuration(analytics.averageDuration)}`;
  container.append(title);

  if (analytics.timeline.length === 0) {
    container.append(empty("No sessions to plot"));
    return;
  }

  const bars = document.createElement("div");
  bars.className = "timeline-bars";

  for (const item of analytics.timeline) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `timeline-run ${phaseClass(item.phase)} ${item.id === selectedRunId ? "selected" : ""}`;
    button.style.setProperty("--run-height", `${durationHeight(item.durationMs, analytics.maxDuration)}%`);
    button.title = `${dateLabel(item.startedAt ?? item.updatedAt)} | ${PHASE_LABELS[item.phase]} | ${formatDuration(item.durationMs)}`;
    button.setAttribute(
      "aria-label",
      `${dateLabel(item.startedAt ?? item.updatedAt)} ${PHASE_LABELS[item.phase]}, duration ${formatDuration(item.durationMs)}`
    );
    button.addEventListener("click", () => onSelectRun(item));

    const bar = document.createElement("span");
    bar.className = "timeline-run-bar";
    const label = document.createElement("span");
    label.className = "timeline-run-label";
    label.textContent = dateLabel(item.startedAt ?? item.updatedAt);

    button.append(bar, label);
    bars.append(button);
  }

  container.append(bars);
}

function uniqueRuns(run, runs) {
  const seen = new Set();
  const history = (Array.isArray(runs) ? runs : []).filter(Boolean);
  const runKey = run ? runIdentity(run) : null;
  const runIsInHistory = runKey ? history.some((item) => runIdentity(item) === runKey) : false;
  const combined = [run && !runIsInHistory ? run : null, ...history].filter(Boolean);
  const output = [];

  for (const item of combined) {
    const id = runIdentity(item);
    if (seen.has(id)) continue;
    seen.add(id);
    output.push(item);
  }

  return output.slice(0, 8);
}

function runIdentity(run) {
  return run.id ?? run.session ?? `${run.startedAt ?? ""}-${run.goal ?? ""}`;
}

function normalizePhase(phase) {
  const value = String(phase ?? "unknown").toLowerCase().replace(/-/g, "_");
  return PHASE_ORDER.includes(value) ? value : "unknown";
}

function phaseClass(phase) {
  return `phase-${String(phase).replace(/_/g, "-")}`;
}

function runDurationMs(run) {
  const start = Date.parse(run?.startedAt ?? "");
  const end = Date.parse(run?.completedAt ?? run?.updatedAt ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

function durationHeight(durationMs, maxDurationMs) {
  if (durationMs === null || maxDurationMs <= 0) return 28;
  return Math.max(28, Math.round((durationMs / maxDurationMs) * 100));
}

function providerTokenTotal(provider) {
  const usage = provider?.usage ?? {};
  const reportedTotal = Number(usage.total_tokens ?? usage.total);
  if (Number.isFinite(reportedTotal) && reportedTotal > 0) return reportedTotal;

  return [usage.input_tokens, usage.output_tokens, usage.input, usage.output, usage.prompt_tokens, usage.completion_tokens]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((sum, value) => sum + value, 0);
}

function analyticsTitle(run, phaseCounts, total) {
  if (!total) return "No sessions yet";
  if (normalizePhase(run?.phase) === "running") return "A run is active now";
  if (phaseCounts.blocked > phaseCounts.done) return "Blocked runs need attention";
  if (phaseCounts.rounds_exhausted > 0) return "Some runs are stopping at round limits";
  if (phaseCounts.done === total) return "Recent sessions are completing cleanly";
  return "Recent run outcomes at a glance";
}

function analyticsMeta(total, run) {
  if (!total) return "Start or load a run to populate this view.";
  const activePhase = run?.phase ? PHASE_LABELS[normalizePhase(run.phase)] : "No run selected";
  return `${total} recent ${total === 1 ? "session" : "sessions"} | selected ${activePhase}`;
}

function phaseMixLabel(phaseCounts) {
  return PHASE_ORDER.filter((phase) => phaseCounts[phase])
    .map((phase) => `${PHASE_LABELS[phase]} ${phaseCounts[phase]}`)
    .join(", ");
}

function segmentLabel(phase, count, share) {
  if (share < 16) return "";
  if (share < 28 || PHASE_LABELS[phase].length > 10) return String(count);
  return `${PHASE_LABELS[phase]} ${count}`;
}

function formatDuration(durationMs) {
  if (durationMs === null) return "not recorded";
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function compactNumber(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
