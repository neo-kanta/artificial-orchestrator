import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readLatest } from "./logger.js";

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

  const [status, providerState, orgState] = await Promise.all([
    readJson(join(dir, "status.json")),
    readJson(join(dir, "provider-state.json")),
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

function collectBlockers(status, final) {
  const values = [
    ...(Array.isArray(status.blockers) ? status.blockers : []),
    ...(Array.isArray(final?.blockers) ? final.blockers : [])
  ];
  return [...new Set(values.map((value) => String(value?.blocker ?? value ?? "").trim()).filter(Boolean))];
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

function compactLine(value, maxChars) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 15)).trim()}... [truncated]`;
}
