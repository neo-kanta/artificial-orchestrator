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

    const text = document.createElement("span");
    text.textContent = `${provider.label} (${provider.kind})`;

    label.append(input, text);
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
  for (const input of elements.providerList.querySelectorAll("input")) {
    input.disabled = disabled;
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
}

export function selectedProject(projects, selectedProjectName, activeProject = null) {
  return selectProject(projects, selectedProjectName) ?? activeProject ?? null;
}

export function checkedProviderIds(elements) {
  return [...elements.providerList.querySelectorAll("input:checked")].map((input) => input.value);
}

export function launchInput(elements) {
  return {
    goal: elements.goalInput.value.trim(),
    orgName: elements.orgSelect.value,
    providerIds: checkedProviderIds(elements),
    rounds: Number(elements.roundsInput.value),
    apply: elements.applyToggle.checked,
    unsafe: elements.unsafeToggle.checked
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

function selectProject(projects, selectedProjectName) {
  return projects.find((project) => project.name === selectedProjectName) ?? null;
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
