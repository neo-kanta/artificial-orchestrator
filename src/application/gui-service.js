import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { loadConfig, providerRegistry } from "../platform/config.js";
import { handoffForTurn } from "../domain/handoff.js";
import { listOrgs } from "../platform/orgs.js";
import { runDuet } from "../orchestration/orchestrator.js";
import { addProject, currentProject, listProjects, useProject } from "../platform/projects.js";
import { latestStatus, recentStatuses, statusForSession } from "../orchestration/status-reader.js";
import { collectBlockers, publicOrgState, publicProviderState } from "../domain/run-status.js";
import { recoveryCenterForRun } from "../domain/recovery.js";
import { prepareRunOptions } from "./run-options.js";
import { assertDirectory, readTail } from "../shared/workspace.js";
import { compactText } from "../shared/text.js";

const DEFAULT_TRANSCRIPT_CHARS = 30000;
const DEFAULT_AGENT_MESSAGE_CHARS = 6000;
const DEFAULT_AGENT_HANDOFF_CHARS = 1600;
const DEFAULT_HISTORY_LIMIT = 8;

export async function guiState(options = {}) {
  const projects = await listProjects({ registryPath: options.registryPath });
  const activeProject = await currentProject({ registryPath: options.registryPath });
  const workspace = resolve(String(options.workspace ?? activeProject?.path ?? options.cwd ?? process.cwd()));
  const config = await loadConfig({ workspace, configPath: options.configPath });
  const [run, runHistory] = await Promise.all([optionalLatestSnapshot(workspace, options), optionalRunHistory(workspace, options)]);

  return {
    activeProject,
    projects,
    workspace,
    providers: publicProviders(providerRegistry(config), config),
    orgs: publicOrgs(listOrgs(config)),
    run,
    runHistory
  };
}

export async function addGuiProject({ name, path, registryPath, setActive = true, requireExisting = true } = {}) {
  if (!String(path ?? "").trim()) throw new Error("Choose a project path before adding it.");
  const projectPath = resolve(String(path ?? ""));
  if (requireExisting) await assertDirectory(projectPath, "Project path");
  return addProject({ name, path: projectPath, registryPath, setActive });
}

export async function useGuiProject({ name, registryPath } = {}) {
  return useProject({ name, registryPath });
}

export async function createGuiRunOptions(input = {}) {
  return prepareRunOptions(input);
}

export async function startGuiRun(input = {}, deps = {}) {
  const options = await createGuiRunOptions(input);
  return runDuet({
    ...options,
    callProvider: deps.callProvider
  });
}

export async function guiRunHistory(workspace, options = {}) {
  const runs = await recentStatuses(workspace, { limit: options.historyLimit ?? DEFAULT_HISTORY_LIMIT });
  return runs.map(publicRunHistoryEntry);
}

export async function guiRunSnapshot(workspace, options = {}) {
  const run = options.sessionId ? await statusForSession(workspace, options.sessionId) : await latestStatus(workspace);
  const [transcript, handoff, agentMessages] = await Promise.all([
    readTail(run.files.transcript, Number(options.maxTranscriptChars ?? DEFAULT_TRANSCRIPT_CHARS)),
    readTail(run.files.handoff, Number(options.maxHandoffChars ?? 6000)),
    readAgentMessages(run.session, options)
  ]);
  const phase = run.status?.phase ?? run.providerState?.phase ?? "unknown";
  const final = run.status?.final ?? run.providerState?.final ?? null;

  const snapshot = {
    id: runId(run),
    session: run.session,
    goal: run.status?.goal ?? run.providerState?.goal ?? "",
    phase,
    project: run.status?.project ?? run.providerState?.project ?? null,
    startedAt: run.status?.startedAt ?? run.providerState?.startedAt ?? null,
    updatedAt: run.status?.updatedAt ?? run.providerState?.updatedAt ?? null,
    completedAt: run.status?.completedAt ?? run.providerState?.completedAt ?? null,
    final,
    blockers: collectBlockers(run.status, final),
    providers: publicProviderState(run.status, run.providerState),
    activeRole: run.providerState?.handoffs?.at(-1)?.provider ?? final?.provider ?? null,
    latestHandoff: run.providerState?.handoffs?.at(-1)?.handoff ?? "",
    files: run.files,
    transcript,
    handoff,
    agentMessages,
    org: publicOrgState(run.orgState)
  };
  return {
    ...snapshot,
    recovery: recoveryCenterForRun(snapshot)
  };
}

function publicRunHistoryEntry(run) {
  const phase = run.status?.phase ?? run.providerState?.phase ?? "unknown";
  const final = run.status?.final ?? run.providerState?.final ?? null;
  const org = publicOrgState(run.orgState);
  const providers = publicProviderState(run.status, run.providerState);

  return {
    id: runId(run),
    session: run.session,
    goal: run.status?.goal ?? run.providerState?.goal ?? "",
    phase,
    project: run.status?.project ?? run.providerState?.project ?? null,
    org: org
      ? {
          id: org.id,
          label: org.label,
          phase: org.phase
        }
      : null,
    startedAt: run.status?.startedAt ?? run.providerState?.startedAt ?? null,
    updatedAt: run.status?.updatedAt ?? run.providerState?.updatedAt ?? null,
    completedAt: run.status?.completedAt ?? run.providerState?.completedAt ?? null,
    final: final
      ? {
          status: final.status ?? null,
          reason: final.reason ?? null,
          provider: final.provider ?? null,
          round: final.round ?? null,
          at: final.at ?? null
        }
      : null,
    blockers: collectBlockers(run.status, final),
    providerCount: providers.length,
    files: run.files
  };
}

function publicProviders(registry, config) {
  return Object.values(registry)
    .map((provider) => ({
      id: provider.id,
      label: provider.label ?? provider.id,
      kind: provider.kind ?? "command",
      role: provider.role ?? "provider",
      model: provider.model ?? defaultModelForKind(provider.kind),
      configured: Boolean(config?.providers?.[provider.id]),
      readiness: providerReadiness(provider)
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function defaultModelForKind(kind) {
  if (kind === "codex") return "gpt-5.4-mini";
  if (kind === "openai") return "gpt-5.5";
  return null;
}

function providerReadiness(provider) {
  if (provider.kind === "openai") {
    const hasKey = Boolean(process.env.OPENAI_API_KEY);
    return {
      status: hasKey ? "ready" : "blocked",
      label: hasKey ? "API key available" : "Missing OPENAI_API_KEY",
      message: hasKey ? "OPENAI_API_KEY is available to the desktop process." : "Set OPENAI_API_KEY before starting OpenAI-backed providers."
    };
  }

  if (provider.kind === "codex") {
    return {
      status: "unchecked",
      label: "Codex CLI auth",
      message: "Uses the local Codex CLI, auth, quota, and sandbox settings."
    };
  }

  if (provider.kind === "claude") {
    return {
      status: "unchecked",
      label: "Claude CLI auth",
      message: "Uses the local Claude CLI, auth, quota, and usage limits."
    };
  }

  return {
    status: "unchecked",
    label: "External command",
    message: "Readiness is checked when the configured command starts."
  };
}

function publicOrgs(orgs) {
  return orgs.map((org) => ({
    id: org.id,
    label: org.label ?? org.id,
    description: org.description ?? "",
    pipeline: org.pipeline ?? [],
    roles: publicOrgRoles(org),
    edges: publicOrgEdges(org)
  }));
}

async function readAgentMessages(sessionDir, options = {}) {
  let text;
  try {
    text = await readFile(join(sessionDir, "events.ndjson"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const maxTextChars = Number(options.maxAgentMessageChars ?? DEFAULT_AGENT_MESSAGE_CHARS);
  const maxHandoffChars = Number(options.maxAgentHandoffChars ?? DEFAULT_AGENT_HANDOFF_CHARS);
  return text
    .split(/\r?\n/)
    .map((line, index) => publicAgentMessage(parseEventLine(line), index, maxTextChars, maxHandoffChars))
    .filter(Boolean);
}

function parseEventLine(line) {
  const text = String(line ?? "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function publicAgentMessage(turn, index, maxTextChars, maxHandoffChars) {
  if (!turn || typeof turn !== "object") return null;
  const speaker = String(turn.role ?? turn.provider ?? turn.providerId ?? `agent-${index + 1}`).trim() || `agent-${index + 1}`;
  const provider = turn.provider ? String(turn.provider) : speaker;
  const providerId = turn.providerId ? String(turn.providerId) : provider;
  const round = Number(turn.round);
  const durationMs = Number(turn.durationMs);

  return {
    id: `${Number.isFinite(round) ? round : index + 1}-${speaker}-${index}`,
    agentId: speaker,
    speaker,
    role: turn.role ? String(turn.role) : null,
    provider,
    providerId,
    providerKind: turn.providerKind ? String(turn.providerKind) : null,
    round: Number.isFinite(round) ? round : null,
    status: publicTurnStatus(turn),
    ok: typeof turn.ok === "boolean" ? turn.ok : null,
    at: turn.at ?? null,
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    usageLine: turn.usageLine ? String(turn.usageLine) : "",
    limit: turn.limit
      ? {
          reset: turn.limit.reset ? String(turn.limit.reset) : null
        }
      : null,
    text: compactText(turn.text ?? "(no output)", maxTextChars),
    handoff: compactText(handoffForTurn(turn), maxHandoffChars),
    blockers: publicBlockers(turn.blockers)
  };
}

function publicTurnStatus(turn) {
  const status = String(turn.orgStatus ?? "").toLowerCase().replace(/_/g, "-");
  if (["continue", "done", "blocked"].includes(status)) return status;
  if (turn.ok === false) return "blocked";
  if (turn.ok === true) return "continue";
  return "unknown";
}

function publicBlockers(blockers) {
  if (!Array.isArray(blockers)) return [];
  return blockers.map((blocker) => compactText(blocker, 400)).filter(Boolean);
}

function publicOrgRoles(org) {
  const roles = org.roles ?? {};
  const pipeline = Array.isArray(org.pipeline) && org.pipeline.length ? org.pipeline : Object.keys(roles);
  return pipeline.map((roleName) => {
    const role = roles[roleName] ?? {};
    return {
      id: roleName,
      label: role.label ?? titleCase(roleName),
      provider: role.provider ?? "unknown",
      responsibility: role.responsibility ?? ""
    };
  });
}

function publicOrgEdges(org) {
  const pipeline = Array.isArray(org.pipeline) && org.pipeline.length ? org.pipeline : Object.keys(org.roles ?? {});
  return pipeline.slice(0, -1).map((from, index) => ({
    from,
    to: pipeline[index + 1],
    label: `${from} -> ${pipeline[index + 1]}`
  }));
}

function titleCase(value) {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function optionalLatestSnapshot(workspace, options) {
  try {
    return await guiRunSnapshot(workspace, options);
  } catch (error) {
    if (error.code === "ENOENT" || /No Artificial Orchestrator sessions found/.test(error.message)) return null;
    throw error;
  }
}

async function optionalRunHistory(workspace, options) {
  try {
    return await guiRunHistory(workspace, options);
  } catch (error) {
    if (error.code === "ENOENT" || /No Artificial Orchestrator sessions found/.test(error.message)) return [];
    throw error;
  }
}

function runId(run) {
  return run.status?.id ?? run.providerState?.id ?? basename(run.session);
}
