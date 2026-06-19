export function setActiveView(elements, mode) {
  const activeMode = mode === "hierarchy" ? "hierarchy" : "sessions";
  elements.sessionView.hidden = activeMode !== "sessions";
  elements.hierarchyView.hidden = activeMode !== "hierarchy";
  document.body.dataset.view = activeMode;

  for (const button of elements.viewModeButtons) {
    const selected = button.dataset.viewMode === activeMode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  }
}

export function renderSessionView(elements, context, handlers) {
  const {
    activeProject = null,
    run = null,
    runHistory = [],
    selectedRunId = null,
    searchQuery = "",
    draftMode = false,
    processState = {},
    launchInput = {},
    notice = null
  } = context;

  const visibleRuns = filterSessions(runHistory, searchQuery);
  const selectedRun = draftMode ? null : run;

  renderSessionList(elements, visibleRuns, selectedRunId, handlers.onSelectRun);
  renderThread(elements, selectedRun, draftMode);
  renderComposer(elements, { activeProject, processState, launchInput, notice });

  elements.sessionCount.textContent = String(runHistory.length);
  elements.chatSessionTitle.textContent = draftMode || !selectedRun ? "New session" : sessionTitle(selectedRun);
  elements.chatStatusLeft.textContent = statusLeft(selectedRun, processState);
  elements.chatStatusCenter.textContent = activeProject ? activeProject.name : "No active project";
  elements.chatStatusRight.textContent = statusRight(selectedRun, runHistory);
}

export function resizeComposer(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 142)}px`;
}

export function filterSessions(runs = [], query = "") {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return runs;
  return runs.filter((run) => {
    const haystack = [run.goal, run.phase, run.project?.name, run.org?.label, run.org?.id, run.startedAt, run.updatedAt]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function sessionTitle(run) {
  const goal = String(run?.goal ?? "").replace(/\s+/g, " ").trim();
  return goal ? compact(goal, 42) : "Untitled session";
}

function renderSessionList(elements, runs, selectedRunId, onSelectRun) {
  elements.sessionList.replaceChildren();

  if (runs.length === 0) {
    elements.sessionList.append(emptyNote("No sessions found"));
    return;
  }

  for (const run of runs) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `session-row ${run.id === selectedRunId ? "selected" : ""}`;
    row.addEventListener("click", () => onSelectRun(run));

    const marker = document.createElement("span");
    marker.className = "session-dot";

    const body = document.createElement("span");
    body.className = "session-row-body";
    const title = document.createElement("strong");
    title.textContent = sessionTitle(run);
    const meta = document.createElement("small");
    meta.textContent = sessionMeta(run);
    body.append(title, meta);

    row.append(marker, body);
    elements.sessionList.append(row);
  }
}

function renderThread(elements, run, draftMode) {
  elements.chatThread.replaceChildren();

  if (draftMode || !run) {
    elements.chatThread.append(messageCard("system", "New session", "Start a run from the composer, or choose a recent session from the sidebar."));
    return;
  }

  elements.chatThread.append(messageCard("user", "Goal", run.goal || "(no goal recorded)"));

  const messages = Array.isArray(run.agentMessages) ? run.agentMessages : [];
  if (messages.length === 0) {
    elements.chatThread.append(messageCard("system", "Waiting", "Agent messages will appear here once the run starts."));
    return;
  }

  for (const message of messages) {
    elements.chatThread.append(messageCard("agent", messageTitle(message), message.text || "(no output)", messageMeta(message)));
  }
}

function renderComposer(elements, { activeProject, processState, launchInput, notice }) {
  const hasGoal = elements.chatGoalInput.value.trim().length > 0;
  const activeRun = Boolean(processState.activeRun);
  elements.chatSendButton.disabled = !activeProject || activeRun || !hasGoal;
  elements.chatSendButton.textContent = activeRun ? "Active" : "Start";
  elements.chatComposerMeta.textContent = composerMeta(launchInput);

  if (notice?.message) {
    elements.chatNotice.textContent = notice.message;
    elements.chatNotice.classList.toggle("error", Boolean(notice.error));
  } else if (!activeProject) {
    elements.chatNotice.textContent = "Select a project in Hierarchy page before starting a session.";
    elements.chatNotice.classList.add("error");
  } else if (activeRun) {
    elements.chatNotice.textContent = "A run is active. This page will update as agents respond.";
    elements.chatNotice.classList.remove("error");
  } else {
    elements.chatNotice.textContent = "";
    elements.chatNotice.classList.remove("error");
  }
}

function messageCard(kind, title, text, meta = "") {
  const card = document.createElement("article");
  card.className = `chat-card chat-card-${kind}`;

  const head = document.createElement("div");
  head.className = "chat-card-head";
  const label = document.createElement("span");
  label.textContent = title;
  head.append(label);

  const body = document.createElement("pre");
  body.className = "chat-card-body";
  body.textContent = text;

  card.append(head, body);

  if (meta) {
    const metaNode = document.createElement("div");
    metaNode.className = "chat-card-meta";
    metaNode.textContent = meta;
    card.append(metaNode);
  }

  return card;
}

function messageTitle(message) {
  const speaker = message.speaker || message.role || message.agentId || message.provider || "Agent";
  const status = normalizeStatus(message.status);
  return `${titleCase(speaker)} - ${status}`;
}

function messageMeta(message) {
  return [
    message.round ? `round ${message.round}` : null,
    message.providerKind || null,
    message.providerId || null,
    message.durationMs !== null && message.durationMs !== undefined ? formatDuration(message.durationMs) : null,
    message.usageLine || null
  ]
    .filter(Boolean)
    .join(" | ");
}

function sessionMeta(run) {
  return [
    normalizeStatus(run.phase),
    run.project?.name ?? null,
    run.startedAt ? shortDate(run.startedAt) : run.updatedAt ? shortDate(run.updatedAt) : null
  ]
    .filter(Boolean)
    .join(" | ");
}

function composerMeta(input = {}) {
  const rounds = Number(input.rounds);
  const roundText = Number.isFinite(rounds) && rounds > 0 ? `${rounds} ${rounds === 1 ? "round" : "rounds"}` : "rounds unset";
  if (input.orgName) return `Organization preset - ${roundText}`;

  const providers = Array.isArray(input.providerIds) ? input.providerIds.length : 0;
  const providerText = providers === 1 ? "1 provider" : `${providers} providers`;
  return `${providerText} - ${roundText}`;
}

function statusLeft(run, processState) {
  if (processState.activeRun) return "Gateway running";
  return run ? `Gateway ${normalizeStatus(run.phase)}` : "Gateway ready";
}

function statusRight(run, runHistory) {
  if (run?.id) return `Session ${compact(run.id, 16)}`;
  const count = Array.isArray(runHistory) ? runHistory.length : 0;
  return count === 1 ? "1 saved session" : `${count} saved sessions`;
}

function emptyNote(text) {
  const node = document.createElement("div");
  node.className = "session-empty";
  node.textContent = text;
  return node;
}

function normalizeStatus(status) {
  return String(status ?? "idle").replace(/_/g, " ");
}

function titleCase(value) {
  return String(value ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(durationMs) {
  const seconds = Math.max(0, Math.round(Number(durationMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function compact(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
