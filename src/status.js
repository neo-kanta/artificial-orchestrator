import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readLatest } from "./logger.js";
import { collectBlockers } from "./domain/run-status.js";
import { compactLine } from "./shared/text.js";

export async function printLatestStatus(workspace, options = {}) {
  const status = await latestStatus(workspace);
  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(formatLatestStatus(status));
}

export async function latestStatus(workspace) {
  let dir;
  try {
    dir = await readLatest(workspace);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`No Artificial Orchestrator sessions found for workspace: ${workspace}`);
    }
    throw error;
  }

  return statusFromDirectory(dir);
}

export async function statusForSession(workspace, sessionId) {
  const id = String(sessionId ?? "").trim();
  if (!id) throw new Error("Choose a run before loading it.");
  if (id.includes("/") || id.includes("\\") || id === "." || id === "..") {
    throw new Error("Run id must be a session directory name.");
  }
  return statusFromDirectory(join(workspace, ".duet", "sessions", id));
}

export async function recentStatuses(workspace, options = {}) {
  const limit = historyLimit(options.limit);
  const sessionsDir = join(workspace, ".duet", "sessions");
  let entries;
  try {
    entries = await readdir(sessionsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const runs = [];
  const sessionNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  for (const name of sessionNames) {
    if (runs.length >= limit) break;
    try {
      runs.push(await statusFromDirectory(join(sessionsDir, name)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return runs;
}

function historyLimit(value) {
  const requested = Number(value ?? 8);
  if (!Number.isFinite(requested)) return 8;
  return Math.max(1, Math.min(50, Math.trunc(requested)));
}

async function statusFromDirectory(dir) {
  const [status, providerState, orgState] = await Promise.all([
    readJson(join(dir, "status.json")),
    readOptionalJson(join(dir, "provider-state.json")),
    readOptionalJson(join(dir, "org-state.json"))
  ]);

  return {
    session: dir,
    status,
    providerState,
    orgState,
    files: {
      transcript: join(dir, "transcript.md"),
      status: join(dir, "status.json"),
      handoff: join(dir, "handoff.md"),
      providerState: join(dir, "provider-state.json"),
      orgState: orgState ? join(dir, "org-state.json") : null
    }
  };
}

export function formatLatestStatus(run) {
  const status = run.status ?? {};
  const providerState = run.providerState ?? {};
  const final = status.final ?? providerState.final ?? null;
  const project = status.project ?? providerState.project ?? null;
  const latestHandoff = providerState.handoffs?.at(-1)?.handoff ?? null;
  const blockers = collectBlockers(status, final);
  const providers = Object.entries(providerState.providers ?? status.providers ?? {});

  const lines = [
    "Artificial Orchestrator Status",
    `session: ${run.session}`,
    project ? `project: ${project.name}` : null,
    project?.path ? `workspace: ${project.path}` : null,
    `phase: ${status.phase ?? providerState.phase ?? "unknown"}`,
    status.goal ? `goal: ${status.goal}` : null,
    status.startedAt ? `started: ${status.startedAt}` : null,
    status.updatedAt ? `updated: ${status.updatedAt}` : null,
    status.completedAt ? `completed: ${status.completedAt}` : null,
    final ? `final: ${final.status ?? "unknown"} (${final.reason ?? "no reason"})` : null,
    final?.provider ? `final provider: ${final.provider}` : null,
    final?.round ? `final round: ${final.round}` : null
  ].filter(Boolean);

  if (blockers.length > 0) {
    lines.push("", "blockers:");
    for (const blocker of blockers) lines.push(`- ${compactLine(blocker, 240)}`);
  }

  if (providers.length > 0) {
    lines.push("", "providers:");
    for (const [id, provider] of providers) lines.push(`- ${formatProviderLine(id, provider)}`);
  }

  if (latestHandoff) {
    lines.push("", `latest handoff: ${compactLine(latestHandoff, 300)}`);
  }

  lines.push(
    "",
    "files:",
    `- transcript: ${run.files.transcript}`,
    `- status: ${run.files.status}`,
    `- handoff: ${run.files.handoff}`,
    `- provider state: ${run.files.providerState}`
  );
  if (run.files.orgState) lines.push(`- org state: ${run.files.orgState}`);

  return lines.join("\n");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readOptionalJson(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function formatProviderLine(id, provider) {
  const state = provider.ok === false ? "blocked" : provider.ok === true ? "ok" : "unknown";
  const parts = [
    `${id}: ${state}`,
    provider.lastRound ? `round ${provider.lastRound}` : null,
    provider.lastAt ? `at ${provider.lastAt}` : null,
    provider.limit ? `limit reset ${provider.limit.reset}` : null
  ].filter(Boolean);

  return parts.join(" | ");
}
