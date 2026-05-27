import { elements } from "./elements.js";
import {
  checkedProviderIds,
  clearProjectForm,
  launchInput,
  renderLauncher,
  renderOrgChoices,
  renderProjects,
  renderProviderChoices,
  renderProviderDisabledState,
  renderRun,
  selectedProject,
  setMessage
} from "./view.js";

const api = window.ao ?? null;

let currentState = null;
let selectedProjectName = null;
let currentWorkspace = null;
let polling = null;

bindEvents();

if (api) {
  refreshState();
  polling = setInterval(refreshLiveState, 2000);
} else {
  elements.startButton.disabled = true;
  setMessage(elements, "Desktop bridge unavailable.", true);
}

function bindEvents() {
  elements.refreshButton.addEventListener("click", () => refreshState());
  elements.browseButton.addEventListener("click", chooseProjectPath);
  elements.projectForm.addEventListener("submit", addProject);
  elements.orgSelect.addEventListener("change", () => renderProviderDisabledState(elements));
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
  renderRun(elements, currentState.run, openPath);

  currentWorkspace = activeProject()?.path ?? currentState.workspace;
  await refreshLiveState();
}

async function refreshLiveState() {
  if (!api) return;
  const processState = await api.runProcess();
  if (processState.activeRun) {
    currentWorkspace = processState.activeRun.workspace;
  }

  if (!currentWorkspace) return;

  try {
    const snapshot = await api.snapshot({ workspace: currentWorkspace });
    if (snapshot) renderRun(elements, snapshot, openPath);
  } catch (error) {
    if (processState.lastRunError) setMessage(elements, processState.lastRunError.message, true);
  }
}

async function selectProject(project) {
  await api.useProject({ name: project.name });
  selectedProjectName = project.name;
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

async function openPath(path) {
  await api.openPath({ path });
}

function activeProject() {
  return selectedProject(currentState?.projects ?? [], selectedProjectName, currentState?.activeProject ?? null);
}

window.addEventListener("beforeunload", () => {
  if (polling) clearInterval(polling);
});
