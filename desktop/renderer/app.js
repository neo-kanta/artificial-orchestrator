import { elements } from "./elements.js";
import {
  checkedProviderIds,
  clearProjectForm,
  launchInput,
  renderLauncher,
  renderOrgMap,
  renderOrgChoices,
  renderProjects,
  renderProviderChoices,
  renderProviderDisabledState,
  renderRun,
  renderRunHistory,
  selectedProject,
  setMessage
} from "./view.js";

const api = window.ao ?? null;

let currentState = null;
let selectedProjectName = null;
let currentWorkspace = null;
let selectedSessionId = null;
let polling = null;

bindEvents();

if (api) {
  refreshState();
  polling = setInterval(refreshLiveState, 2000);
} else {
  renderOrgMap(elements, null, ["claude", "codex"], []);
  elements.startButton.disabled = true;
  renderRunHistory(elements, [], null, () => {});
  setMessage(elements, "Desktop bridge unavailable.", true);
}

function bindEvents() {
  elements.refreshButton.addEventListener("click", () => refreshState());
  elements.browseButton.addEventListener("click", chooseProjectPath);
  elements.projectForm.addEventListener("submit", addProject);
  elements.orgSelect.addEventListener("change", () => {
    renderProviderDisabledState(elements);
    renderCurrentOrgMap();
  });
  elements.providerList.addEventListener("change", renderCurrentOrgMap);
  elements.startButton.addEventListener("click", startRun);
}

async function refreshState() {
  setMessage(elements, "");
  currentState = await api.state();
  selectedProjectName ??= currentState.activeProject?.name ?? currentState.projects[0]?.name ?? null;

  renderProjects(elements, currentState.projects, selectedProjectName, selectProject);
  renderLauncher(elements, activeProject());
  renderProviderChoices(elements, currentState.providers, checkedProviderIds(elements));
  renderOrgChoices(elements, currentState.orgs);
  if (!elements.orgSelect.value && currentState.run?.org?.id && currentState.orgs.some((org) => org.id === currentState.run.org.id)) {
    elements.orgSelect.value = currentState.run.org.id;
    renderProviderDisabledState(elements);
  }
  renderCurrentOrgMap();
  renderRun(elements, currentState.run, openPath);
  renderRunHistory(elements, currentState.runHistory ?? [], selectedSessionId ?? currentState.run?.id ?? null, selectHistoryRun);

  currentWorkspace = activeProject()?.path ?? currentState.workspace;
  await refreshLiveState();
}

async function refreshLiveState() {
  if (!api) return;
  const processState = await api.runProcess();
  if (processState.activeRun) {
    currentWorkspace = processState.activeRun.workspace;
    selectedSessionId = null;
  }

  if (!currentWorkspace) return;

  try {
    const snapshot = await api.snapshot({ workspace: currentWorkspace, sessionId: selectedSessionId });
    if (snapshot) {
      if (currentState) currentState.run = snapshot;
      renderRun(elements, snapshot, openPath);
    }
    const runHistory = await api.history({ workspace: currentWorkspace });
    if (currentState) currentState.runHistory = runHistory;
    renderRunHistory(elements, runHistory, snapshot?.id ?? selectedSessionId, selectHistoryRun);
  } catch (error) {
    if (processState.lastRunError) setMessage(elements, processState.lastRunError.message, true);
  }
}

async function selectProject(project) {
  await api.useProject({ name: project.name });
  selectedProjectName = project.name;
  selectedSessionId = null;
  await refreshState();
}

async function chooseProjectPath() {
  if (!api) return;
  const path = await api.chooseDirectory();
  if (path) elements.projectPath.value = path;
}

async function addProject(event) {
  event.preventDefault();
  try {
    const name = elements.projectName.value.trim();
    const path = elements.projectPath.value.trim();
    const result = await api.addProject({ name, path, setActive: true });
    selectedProjectName = result.project.name;
    selectedSessionId = null;
    clearProjectForm(elements);
    await refreshState();
  } catch (error) {
    setMessage(elements, error.message, true);
  }
}

async function startRun() {
  const input = launchInput(elements);
  const project = activeProject();

  if (!project) return setMessage(elements, "Select a project before starting.", true);
  if (!input.goal) return setMessage(elements, "Enter a goal before starting.", true);
  if (!input.orgName && input.providerIds.length === 0) return setMessage(elements, "Select at least one provider.", true);

  elements.startButton.disabled = true;
  selectedSessionId = null;
  setMessage(elements, "Starting run...");
  try {
    await api.startRun({
      projectName: project.name,
      ...input
    });
    currentWorkspace = project.path;
    await refreshLiveState();
    setMessage(elements, "");
  } catch (error) {
    setMessage(elements, error.message, true);
  } finally {
    elements.startButton.disabled = false;
  }
}

async function selectHistoryRun(run) {
  if (!currentWorkspace || !run?.id) return;
  try {
    selectedSessionId = run.id;
    const snapshot = await api.snapshot({ workspace: currentWorkspace, sessionId: run.id });
    if (currentState) currentState.run = snapshot;
    renderRun(elements, snapshot, openPath);
    renderRunHistory(elements, currentState?.runHistory ?? [], snapshot.id, selectHistoryRun);
    setMessage(elements, "");
  } catch (error) {
    setMessage(elements, error.message, true);
  }
}

async function openPath(path) {
  await api.openPath({ path });
}

function activeProject() {
  return selectedProject(currentState?.projects ?? [], selectedProjectName, currentState?.activeProject ?? null);
}

function activeOrg() {
  return currentState?.orgs.find((org) => org.id === elements.orgSelect.value) ?? null;
}

function renderCurrentOrgMap() {
  const org = activeOrg();
  const runtimeOrg = org && currentState?.run?.org?.id === org.id ? currentState.run.org : null;
  renderOrgMap(elements, org, checkedProviderIds(elements), currentState?.providers ?? [], runtimeOrg, currentState?.run?.activeRole ?? null);
}

window.addEventListener("beforeunload", () => {
  if (polling) clearInterval(polling);
});
