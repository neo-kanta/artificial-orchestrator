const elements = {
  activeProjectLabel: document.querySelector("#active-project-label"),
  projectList: document.querySelector("#project-list"),
  projectForm: document.querySelector("#project-form"),
  projectName: document.querySelector("#project-name"),
  projectPath: document.querySelector("#project-path"),
  browseButton: document.querySelector("#browse-button"),
  refreshButton: document.querySelector("#refresh-button"),
  workspaceTitle: document.querySelector("#workspace-title"),
  phaseBadge: document.querySelector("#phase-badge"),
  goalInput: document.querySelector("#goal-input"),
  orgSelect: document.querySelector("#org-select"),
  roundsInput: document.querySelector("#rounds-input"),
  providerList: document.querySelector("#provider-list"),
  applyToggle: document.querySelector("#apply-toggle"),
  unsafeToggle: document.querySelector("#unsafe-toggle"),
  startButton: document.querySelector("#start-button"),
  validationMessage: document.querySelector("#validation-message"),
  monitorTitle: document.querySelector("#monitor-title"),
  runTimes: document.querySelector("#run-times"),
  transcriptView: document.querySelector("#transcript-view"),
  providerState: document.querySelector("#provider-state"),
  handoffView: document.querySelector("#handoff-view"),
  blockerList: document.querySelector("#blocker-list"),
  fileList: document.querySelector("#file-list")
};

const api = window.ao ?? null;
let currentState = null;
let selectedProjectName = null;
let currentWorkspace = null;
let polling = null;

elements.refreshButton.addEventListener("click", () => refreshState());
elements.browseButton.addEventListener("click", chooseProjectPath);
elements.projectForm.addEventListener("submit", addProject);
elements.orgSelect.addEventListener("change", renderProviderDisabledState);
elements.startButton.addEventListener("click", startRun);

if (api) {
  refreshState();
  polling = setInterval(refreshLiveState, 2000);
} else {
  elements.startButton.disabled = true;
  setMessage("Desktop bridge unavailable.", true);
}

async function refreshState() {
  setMessage("");
  currentState = await api.state();
  selectedProjectName ??= currentState.activeProject?.name ?? currentState.projects[0]?.name ?? null;
  currentWorkspace = selectedProject()?.path ?? currentState.workspace;

  renderProjects();
  renderLauncher();
  renderProviders();
  renderOrgs();
  renderRun(currentState.run);
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
    if (snapshot) renderRun(snapshot);
  } catch (error) {
    if (processState.lastRunError) setMessage(processState.lastRunError.message, true);
  }
}

function renderProjects() {
  const project = selectedProject();
  elements.activeProjectLabel.textContent = project ? `${project.name} - ${project.path}` : "No active project";
  elements.projectList.replaceChildren();

  if (currentState.projects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-note";
    empty.textContent = "No projects registered";
    elements.projectList.append(empty);
    return;
  }

  for (const item of currentState.projects) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `project-row ${item.name === selectedProjectName ? "selected" : ""}`;
    row.addEventListener("click", async () => {
      await api.useProject({ name: item.name });
      selectedProjectName = item.name;
      await refreshState();
    });

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

function renderLauncher() {
  const project = selectedProject();
  elements.workspaceTitle.textContent = project ? project.name : "Select a project";
  currentWorkspace = project?.path ?? currentState.workspace;
}

function renderProviders() {
  const previouslyChecked = checkedProviderIds();
  elements.providerList.replaceChildren();

  for (const provider of currentState.providers) {
    const label = document.createElement("label");
    label.className = "provider-choice";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = provider.id;
    input.checked = previouslyChecked.length > 0 ? previouslyChecked.includes(provider.id) : ["claude", "codex"].includes(provider.id);

    const text = document.createElement("span");
    text.textContent = `${provider.label} (${provider.kind})`;

    label.append(input, text);
    elements.providerList.append(label);
  }

  renderProviderDisabledState();
}

function renderOrgs() {
  const selected = elements.orgSelect.value;
  elements.orgSelect.replaceChildren(option("", "Provider pipeline"));
  for (const org of currentState.orgs) {
    elements.orgSelect.append(option(org.id, org.label));
  }
  elements.orgSelect.value = selected;
}

function renderProviderDisabledState() {
  const disabled = Boolean(elements.orgSelect.value);
  for (const input of elements.providerList.querySelectorAll("input")) {
    input.disabled = disabled;
  }
}

function renderRun(run) {
  const phase = run?.phase ?? "idle";
  elements.phaseBadge.textContent = phase;
  elements.phaseBadge.className = `phase-badge phase-${phase.replace(/_/g, "-")}`;
  elements.monitorTitle.textContent = run?.goal || "No durable run loaded";
  elements.runTimes.textContent = run ? compactTimes(run) : "";
  elements.transcriptView.textContent = run?.transcript ?? "";
  elements.handoffView.textContent = run?.latestHandoff || run?.handoff || "";

  renderStateList(run?.providers ?? []);
  renderBlockers(run?.blockers ?? []);
  renderFiles(run?.files ?? {});
}

function renderStateList(providers) {
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

function renderBlockers(blockers) {
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

function renderFiles(files) {
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
    button.addEventListener("click", () => api.openPath({ path }));
    row.append(button, text);
    elements.fileList.append(row);
  }
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
    elements.projectName.value = "";
    elements.projectPath.value = "";
    await refreshState();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function startRun() {
  const goal = elements.goalInput.value.trim();
  const orgName = elements.orgSelect.value;
  const providerIds = checkedProviderIds();
  const project = selectedProject();

  if (!project) return setMessage("Select a project before starting.", true);
  if (!goal) return setMessage("Enter a goal before starting.", true);
  if (!orgName && providerIds.length === 0) return setMessage("Select at least one provider.", true);

  elements.startButton.disabled = true;
  setMessage("Starting run...");
  try {
    await api.startRun({
      projectName: project.name,
      goal,
      orgName,
      providerIds,
      rounds: Number(elements.roundsInput.value),
      apply: elements.applyToggle.checked,
      unsafe: elements.unsafeToggle.checked
    });
    currentWorkspace = project.path;
    await refreshLiveState();
    setMessage("");
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    elements.startButton.disabled = false;
  }
}

function selectedProject() {
  return currentState?.projects.find((project) => project.name === selectedProjectName) ?? currentState?.activeProject ?? null;
}

function checkedProviderIds() {
  return [...elements.providerList.querySelectorAll("input:checked")].map((input) => input.value);
}

function setMessage(message, isError = false) {
  elements.validationMessage.textContent = message;
  elements.validationMessage.className = `validation-message ${isError ? "error" : ""}`;
}

function compactTimes(run) {
  return [run.startedAt ? `started ${run.startedAt}` : null, run.updatedAt ? `updated ${run.updatedAt}` : null, run.completedAt ? `completed ${run.completedAt}` : null]
    .filter(Boolean)
    .join(" | ");
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

window.addEventListener("beforeunload", () => {
  if (polling) clearInterval(polling);
});
