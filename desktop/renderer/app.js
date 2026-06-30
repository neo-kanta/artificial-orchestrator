import { elements } from "./elements.js";
import { renderSessionView, resizeComposer, setActiveView } from "./chat-view.js";
import { projectNameFromPath } from "./project-name.js";
import {
  checkedProviderIds,
  clearProjectForm,
  launchInput,
  renderAgentChat,
  renderAgentRoles,
  renderLauncher,
  renderLaunchReadiness,
  renderOrgMap,
  renderOrgChoices,
  renderProjects,
  renderProviderChoices,
  renderProviderDisabledState,
  renderRun,
  renderRunVisualization,
  renderRunHistory,
  selectedProject,
  setMessage
} from "./view.js";

const api = window.ao ?? null;

let currentState = null;
let selectedProjectName = null;
let currentWorkspace = null;
let selectedSessionId = null;
let currentProcessState = { activeRun: null, lastRunError: null };
let polling = null;
let agentRoles = [];
let agentRosterDirty = false;
let selectedAgentId = null;
let activeViewMode = storedViewMode();
let sessionSearchQuery = "";
let draftSession = false;
let chatNotice = null;

bindEvents();
setViewMode(activeViewMode, false);
renderLaunchState();
renderCurrentSessionView();

if (api) {
  refreshState();
  polling = setInterval(refreshLiveState, 2000);
} else {
  renderOrgMap(elements, null, ["claude", "codex"], []);
  renderRunVisualization(elements, null, [], null, () => {});
  renderAgentChat(elements, null, null, () => {});
  elements.startButton.disabled = true;
  renderRunHistory(elements, [], null, () => {});
  renderCurrentSessionView();
  setMessage(elements, "Desktop bridge unavailable.", true);
}

function bindEvents() {
  elements.refreshButton.addEventListener("click", () => refreshState());
  elements.sessionRefreshButton.addEventListener("click", () => refreshState());
  elements.browseButton.addEventListener("click", chooseProjectPath);
  elements.projectForm.addEventListener("submit", addProject);
  for (const button of elements.newSessionButtons) {
    button.addEventListener("click", startDraftSession);
  }
  elements.sessionSearchInput.addEventListener("input", () => {
    sessionSearchQuery = elements.sessionSearchInput.value;
    renderCurrentSessionView();
  });
  elements.chatGoalInput.addEventListener("input", () => {
    resizeComposer(elements.chatGoalInput);
    renderCurrentSessionView();
  });
  elements.chatForm.addEventListener("submit", startRunFromChat);
  for (const button of elements.viewModeButtons) {
    button.addEventListener("click", () => setViewMode(button.dataset.viewMode));
  }
  elements.orgSelect.addEventListener("change", () => {
    renderProviderDisabledState(elements);
    seedAgentRolesFromSelection(true);
    renderCurrentOrgMap();
    renderCurrentSessionView();
  });
  elements.providerList.addEventListener("change", () => {
    if (!elements.orgSelect.value) seedAgentRolesFromSelection(true);
    renderCurrentOrgMap();
    renderLaunchState();
    renderCurrentSessionView();
  });
  elements.goalInput.addEventListener("input", () => {
    renderLaunchState();
    renderCurrentSessionView();
  });
  elements.roundsInput.addEventListener("input", () => {
    renderLaunchState();
    renderCurrentSessionView();
  });
  elements.claudeToolsToggle.addEventListener("change", () => {
    renderLaunchState();
    renderCurrentSessionView();
  });
  for (const input of [elements.permissionPlan, elements.permissionWorkspace, elements.permissionTrusted]) {
    input.addEventListener("change", () => {
      renderLaunchState();
      renderCurrentSessionView();
    });
  }
  elements.startButton.addEventListener("click", startRun);
  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      startDraftSession();
    }
  });
}

async function refreshState() {
  setMessage(elements, "");
  currentState = await api.state();
  currentProcessState = {
    activeRun: currentState.activeRun ?? null,
    lastRunError: currentState.lastRunError ?? null
  };
  selectedProjectName ??= currentState.activeProject?.name ?? currentState.projects[0]?.name ?? null;

  renderProjects(elements, currentState.projects, selectedProjectName, selectProject);
  renderLauncher(elements, activeProject());
  renderProviderChoices(elements, currentState.providers, checkedProviderIds(elements));
  renderOrgChoices(elements, currentState.orgs);
  if (!elements.orgSelect.value && currentState.run?.org?.id && currentState.orgs.some((org) => org.id === currentState.run.org.id)) {
    elements.orgSelect.value = currentState.run.org.id;
    renderProviderDisabledState(elements);
  }
  seedAgentRolesFromSelection(agentRoles.length === 0);
  renderAgentRoster();
  renderCurrentOrgMap();
  renderRun(elements, currentState.run, openPath);
  selectedAgentId = renderAgentChat(elements, currentState.run, selectedAgentId, selectAgentChat);
  renderRunHistory(elements, currentState.runHistory ?? [], selectedSessionId ?? currentState.run?.id ?? null, selectHistoryRun);
  renderRunVisualization(
    elements,
    currentState.run,
    currentState.runHistory ?? [],
    selectedSessionId ?? currentState.run?.id ?? null,
    selectHistoryRun
  );
  renderLaunchState();
  renderCurrentSessionView();

  currentWorkspace = activeProject()?.path ?? currentState.workspace;
  await refreshLiveState();
}

async function refreshLiveState() {
  if (!api) return;
  const processState = await api.runProcess();
  currentProcessState = processState;
  if (processState.activeRun) {
    currentWorkspace = processState.activeRun.workspace;
    selectedSessionId = null;
    draftSession = false;
  }

  if (!currentWorkspace) return;

  try {
    const snapshot = await api.snapshot({ workspace: currentWorkspace, sessionId: selectedSessionId });
    if (snapshot) {
      if (currentState) currentState.run = snapshot;
      renderRun(elements, snapshot, openPath);
      selectedAgentId = renderAgentChat(elements, snapshot, selectedAgentId, selectAgentChat);
    }
    const runHistory = await api.history({ workspace: currentWorkspace });
    if (currentState) currentState.runHistory = runHistory;
    renderRunHistory(elements, runHistory, snapshot?.id ?? selectedSessionId, selectHistoryRun);
    renderRunVisualization(elements, snapshot ?? currentState?.run ?? null, runHistory, snapshot?.id ?? selectedSessionId, selectHistoryRun);
    if (!snapshot) selectedAgentId = renderAgentChat(elements, currentState?.run ?? null, selectedAgentId, selectAgentChat);
  } catch (error) {
    if (processState.lastRunError) setMessage(elements, processState.lastRunError.message, true);
  }
  renderLaunchState();
  renderCurrentSessionView();
}

async function selectProject(project) {
  await api.useProject({ name: project.name });
  selectedProjectName = project.name;
  selectedSessionId = null;
  selectedAgentId = null;
  draftSession = false;
  chatNotice = null;
  await refreshState();
}

async function chooseProjectPath() {
  if (!api) return;
  const path = await api.chooseDirectory();
  if (!path) return;
  elements.projectPath.value = path;
  if (!elements.projectName.value.trim()) elements.projectName.value = projectNameFromPath(path);
}

async function addProject(event) {
  event.preventDefault();
  try {
    const name = elements.projectName.value.trim();
    const path = elements.projectPath.value.trim();
    const result = await api.addProject({ name, path, setActive: true });
    selectedProjectName = result.project.name;
    selectedSessionId = null;
    selectedAgentId = null;
    draftSession = false;
    chatNotice = null;
    clearProjectForm(elements);
    await refreshState();
  } catch (error) {
    setMessage(elements, error.message, true);
  }
}

async function startRun(options = {}) {
  const clearChatOnSuccess = options?.clearChatOnSuccess === true;
  const input = launchInput(elements);
  const project = activeProject();
  const validation = renderLaunchState();

  if (!validation.ok) {
    chatNotice = { message: validation.message, error: true };
    renderCurrentSessionView();
    return;
  }
  if (currentProcessState.activeRun) {
    chatNotice = { message: "A run is already active.", error: false };
    renderCurrentSessionView();
    return;
  }

  elements.startButton.disabled = true;
  elements.startButton.textContent = "Starting...";
  selectedSessionId = null;
  selectedAgentId = null;
  draftSession = false;
  setMessage(elements, "Starting run...");
  let failedToStart = false;
  try {
    const result = await api.startRun({
      projectName: project.name,
      ...(agentRosterDirty ? { agentRoles: launchAgentRoles(), agentOrgLabel: customOrgLabel() } : {}),
      ...input
    });
    currentProcessState = {
      activeRun: result.activeRun ?? null,
      lastRunError: null
    };
    currentWorkspace = project.path;
    await refreshLiveState();
    if (clearChatOnSuccess) {
      elements.chatGoalInput.value = "";
      resizeComposer(elements.chatGoalInput);
    }
    chatNotice = null;
    setMessage(elements, "");
  } catch (error) {
    failedToStart = true;
    const message = error?.message ?? String(error);
    currentProcessState = {
      activeRun: null,
      lastRunError: {
        at: new Date().toISOString(),
        message
      }
    };
    renderLaunchState();
    chatNotice = { message, error: true };
    setMessage(elements, message, true);
  } finally {
    if (!failedToStart) renderLaunchState();
    renderCurrentSessionView();
  }
}

async function selectHistoryRun(run) {
  if (!currentWorkspace || !run?.id) return;
  try {
    selectedSessionId = run.id;
    const snapshot = await api.snapshot({ workspace: currentWorkspace, sessionId: run.id });
    if (currentState) currentState.run = snapshot;
    draftSession = false;
    chatNotice = null;
    renderRun(elements, snapshot, openPath);
    selectedAgentId = renderAgentChat(elements, snapshot, null, selectAgentChat);
    renderRunHistory(elements, currentState?.runHistory ?? [], snapshot.id, selectHistoryRun);
    renderRunVisualization(elements, snapshot, currentState?.runHistory ?? [], snapshot.id, selectHistoryRun);
    renderCurrentSessionView();
    setMessage(elements, "");
  } catch (error) {
    setMessage(elements, error.message, true);
  }
}

async function openPath(path) {
  await api.openPath({ path });
}

function selectAgentChat(agentId) {
  selectedAgentId = agentId;
  selectedAgentId = renderAgentChat(elements, currentState?.run ?? null, selectedAgentId, selectAgentChat);
}

function setViewMode(mode, persist = true) {
  activeViewMode = mode === "hierarchy" ? "hierarchy" : "sessions";
  setActiveView(elements, activeViewMode);
  if (persist) localStorage.setItem("ao:view-mode", activeViewMode);
  if (activeViewMode === "sessions") {
    resizeComposer(elements.chatGoalInput);
    renderCurrentSessionView();
  }
}

function startDraftSession() {
  selectedSessionId = null;
  selectedAgentId = null;
  draftSession = true;
  chatNotice = null;
  elements.chatGoalInput.value = "";
  resizeComposer(elements.chatGoalInput);
  setViewMode("sessions");
  renderCurrentSessionView();
  elements.chatGoalInput.focus();
}

async function startRunFromChat(event) {
  event.preventDefault();
  const goal = elements.chatGoalInput.value.trim();
  if (!goal) {
    chatNotice = { message: "Enter a goal before starting.", error: true };
    renderCurrentSessionView();
    return;
  }

  elements.goalInput.value = goal;
  chatNotice = null;
  draftSession = false;
  renderLaunchState();
  await startRun({ clearChatOnSuccess: true });
}

function renderCurrentSessionView() {
  const selectedRunId = draftSession ? null : selectedSessionId ?? currentState?.run?.id ?? null;
  renderSessionView(
    elements,
    {
      activeProject: activeProject(),
      run: draftSession ? null : currentState?.run ?? null,
      runHistory: currentState?.runHistory ?? [],
      selectedRunId,
      searchQuery: sessionSearchQuery,
      draftMode: draftSession,
      processState: currentProcessState,
      launchInput: launchInput(elements),
      notice: chatNotice
    },
    {
      onSelectRun: selectHistoryRun,
      onOpenPath: openPath
    }
  );
}

function activeProject() {
  return selectedProject(currentState?.projects ?? [], selectedProjectName, currentState?.activeProject ?? null);
}

function activeOrg() {
  return currentState?.orgs.find((org) => org.id === elements.orgSelect.value) ?? null;
}

function renderCurrentOrgMap() {
  const org = previewOrgFromAgentRoles() ?? activeOrg();
  const runtimeOrg = org && currentState?.run?.org?.id === org.id ? currentState.run.org : null;
  renderOrgMap(elements, org, checkedProviderIds(elements), currentState?.providers ?? [], runtimeOrg, currentState?.run?.activeRole ?? null);
}

function renderAgentRoster() {
  renderAgentRoles(
    elements,
    agentRoles,
    currentState?.providers ?? [],
    (roles) => {
      agentRoles = normalizeRoleDrafts(roles);
      agentRosterDirty = true;
      renderCurrentOrgMap();
      renderLaunchState();
    },
    addAgentRole,
    removeAgentRole
  );
}

function seedAgentRolesFromSelection(force = false) {
  if (!force && agentRoles.length > 0) return;
  agentRoles = defaultAgentRoles();
  agentRosterDirty = false;
}

function defaultAgentRoles() {
  const providers = currentState?.providers ?? [];
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const org = activeOrg();
  if (org) {
    return normalizeRoleDrafts(
      org.roles.map((role) => {
        const provider = providerById.get(role.provider);
        return {
          id: role.id,
          label: role.label,
          providerId: role.provider,
          model: provider?.model ?? "",
          responsibility: role.responsibility
        };
      })
    );
  }

  const selected = checkedProviderIds(elements);
  const ids = selected.length > 0 ? selected : ["claude", "codex"];
  return normalizeRoleDrafts(
    ids.map((id) => {
      const provider = providerById.get(id) ?? { id, label: id, role: "provider", model: "" };
      return {
        id,
        label: provider.label ?? id,
        providerId: id,
        model: provider.model ?? "",
        responsibility: provider.role ?? "Collaborate with the other agents."
      };
    })
  );
}

function addAgentRole() {
  const providers = currentState?.providers ?? [];
  const provider = providers.find((item) => item.id === "openai") ?? providers[0] ?? {
    id: "openai",
    label: "OpenAI",
    role: "generalist",
    model: "gpt-5.5"
  };
  agentRoles = normalizeRoleDrafts([
    ...agentRoles,
    {
      id: uniqueRoleId("agent"),
      label: "New role",
      providerId: provider.id,
      model: provider.model ?? "",
      responsibility: "Contribute a focused specialist perspective."
    }
  ]);
  agentRosterDirty = true;
  renderAgentRoster();
  renderCurrentOrgMap();
  renderLaunchState();
}

function removeAgentRole(index) {
  if (agentRoles.length <= 1) return;
  agentRoles = normalizeRoleDrafts(agentRoles.filter((_role, roleIndex) => roleIndex !== index));
  agentRosterDirty = true;
  renderAgentRoster();
  renderCurrentOrgMap();
  renderLaunchState();
}

function launchAgentRoles() {
  return normalizeRoleDrafts(agentRoles).map((role) => ({
    id: role.id,
    label: role.label,
    providerId: role.providerId,
    model: role.model,
    responsibility: role.responsibility
  }));
}

function previewOrgFromAgentRoles() {
  if (!agentRosterDirty || agentRoles.length === 0) return null;
  return {
    id: "desktop-custom-team",
    label: customOrgLabel(),
    roles: agentRoles.map((role) => ({
      id: role.id,
      label: role.label || role.id,
      provider: role.providerId,
      responsibility: role.model ? `${role.responsibility || "Collaborates on the goal."} Model: ${role.model}.` : role.responsibility
    })),
    edges: agentRoles.slice(0, -1).map((role, index) => ({
      from: role.id,
      to: agentRoles[index + 1].id,
      label: `${role.id} -> ${agentRoles[index + 1].id}`
    }))
  };
}

function customOrgLabel() {
  return elements.orgSelect.value ? `${activeOrg()?.label ?? "Preset"} + custom agents` : "Custom agent team";
}

function normalizeRoleDrafts(roles) {
  const seen = new Set();
  return roles.map((role, index) => {
    const label = String(role.label ?? role.id ?? `Agent ${index + 1}`).trim() || `Agent ${index + 1}`;
    const baseId = safeRoleId(role.id || label || `agent-${index + 1}`);
    const id = uniqueRoleId(baseId, seen);
    seen.add(id);
    return {
      id,
      label,
      providerId: String(role.providerId ?? role.provider ?? "openai").trim() || "openai",
      model: String(role.model ?? "").trim(),
      responsibility: String(role.responsibility ?? "").trim()
    };
  });
}

function safeRoleId(value) {
  const id = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || "agent";
}

function uniqueRoleId(base, seen = new Set(agentRoles.map((role) => role.id))) {
  const safeBase = safeRoleId(base);
  let id = safeBase;
  let suffix = 2;
  while (seen.has(id)) {
    id = `${safeBase}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function renderLaunchState() {
  return renderLaunchReadiness(
    elements,
    launchInput(elements),
    {
      project: activeProject(),
      providers: currentState?.providers ?? [],
      orgs: currentState?.orgs ?? [],
      agentRoles: agentRosterDirty ? agentRoles : []
    },
    currentProcessState
  );
}

function storedViewMode() {
  return localStorage.getItem("ao:view-mode") === "hierarchy" ? "hierarchy" : "sessions";
}

window.addEventListener("beforeunload", () => {
  if (polling) clearInterval(polling);
});
