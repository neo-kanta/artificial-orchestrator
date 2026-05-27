import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig, providerRegistry, resolveProviders } from "./config.js";
import { listOrgs, resolveOrg } from "./orgs.js";
import { runDuet } from "./orchestrator.js";
import { addProject, currentProject, listProjects, resolveProjectContext, useProject } from "./projects.js";
import { latestStatus } from "./status.js";
import { runtimeOptions } from "./runtime.js";

const DEFAULT_HISTORY_CHARS = 12000;
const DEFAULT_TRANSCRIPT_CHARS = 30000;

export async function guiState(options = {}) {
  const projects = await listProjects({ registryPath: options.registryPath });
  const activeProject = await currentProject({ registryPath: options.registryPath });
  const workspace = resolve(String(options.workspace ?? activeProject?.path ?? options.cwd ?? process.cwd()));
  const config = await loadConfig({ workspace, configPath: options.configPath });
  const run = await optionalLatestSnapshot(workspace, options);

  return {
    activeProject,
    projects,
    workspace,
    providers: publicProviders(providerRegistry(config), config),
    orgs: publicOrgs(listOrgs(config)),
    run
  };
}

export async function addGuiProject({ name, path, registryPath, setActive = true, requireExisting = true } = {}) {
  if (!String(path ?? "").trim()) throw new Error("Choose a project path before adding it.");
  const projectPath = resolve(String(path ?? ""));
  if (requireExisting) await assertDirectory(projectPath);
  return addProject({ name, path: projectPath, registryPath, setActive });
}

export async function useGuiProject({ name, registryPath } = {}) {
  return useProject({ name, registryPath });
}

export async function createGuiRunOptions(input = {}) {
  const goal = String(input.goal ?? "").trim();
  if (!goal) throw new Error("Enter a goal before starting a run.");

  const rounds = normalizeRounds(input.rounds);
  const projectContext = await resolveProjectContext({
    projectName: input.projectName || undefined,
    workspace: input.workspace || undefined,
    registryPath: input.registryPath
  });
  await assertDirectory(projectContext.path);

  const config = await loadConfig({ workspace: projectContext.path, configPath: input.configPath });
  const runtime = runtimeOptions(input, projectContext.path);
  const orgName = String(input.orgName ?? "").trim();
  const org = orgName ? resolveOrg({ config, orgName, runtime }) : null;
  const providerList = normalizeProviderList(input.providerIds ?? input.providers);
  const providers = org
    ? []
    : resolveProviders({
        config,
        providerList: providerList.length > 0 ? providerList.join(",") : undefined,
        codexOnly: false,
        claudeOnly: false,
        runtime
      });

  return {
    goal,
    workspace: projectContext.path,
    project: projectContext,
    org,
    rounds,
    apply: Boolean(input.apply),
    historyChars: Number(input.historyChars ?? DEFAULT_HISTORY_CHARS),
    providers
  };
}

export async function startGuiRun(input = {}, deps = {}) {
  const options = await createGuiRunOptions(input);
  return runDuet({
    ...options,
    callProvider: deps.callProvider
  });
}

export async function guiRunSnapshot(workspace, options = {}) {
  const run = await latestStatus(workspace);
  const transcript = await readTail(run.files.transcript, Number(options.maxTranscriptChars ?? DEFAULT_TRANSCRIPT_CHARS));
  const handoff = await readTail(run.files.handoff, Number(options.maxHandoffChars ?? 6000));
  const phase = run.status?.phase ?? run.providerState?.phase ?? "unknown";

  return {
    session: run.session,
    goal: run.status?.goal ?? run.providerState?.goal ?? "",
    phase,
    project: run.status?.project ?? run.providerState?.project ?? null,
    startedAt: run.status?.startedAt ?? run.providerState?.startedAt ?? null,
    updatedAt: run.status?.updatedAt ?? run.providerState?.updatedAt ?? null,
    completedAt: run.status?.completedAt ?? run.providerState?.completedAt ?? null,
    final: run.status?.final ?? run.providerState?.final ?? null,
    blockers: collectBlockers(run.status, run.status?.final ?? run.providerState?.final),
    providers: publicProviderState(run.status, run.providerState),
    latestHandoff: run.providerState?.handoffs?.at(-1)?.handoff ?? "",
    files: run.files,
    transcript,
    handoff,
    orgState: run.orgState
  };
}

function publicProviders(registry, config) {
  return Object.values(registry)
    .map((provider) => ({
      id: provider.id,
      label: provider.label ?? provider.id,
      kind: provider.kind ?? "command",
      role: provider.role ?? "provider",
      model: provider.model ?? null,
      configured: Boolean(config?.providers?.[provider.id])
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function publicOrgs(orgs) {
  return orgs.map((org) => ({
    id: org.id,
    label: org.label ?? org.id,
    description: org.description ?? "",
    pipeline: org.pipeline ?? []
  }));
}

function publicProviderState(status, providerState) {
  const values = providerState?.providers ?? status?.providers ?? {};
  return Object.entries(values).map(([id, provider]) => ({
    id,
    ok: provider.ok ?? null,
    state: provider.ok === false ? "blocked" : provider.ok === true ? "ok" : "unknown",
    lastRound: provider.lastRound ?? null,
    lastAt: provider.lastAt ?? null,
    limit: provider.limit ?? null,
    usage: provider.usage ?? null,
    costUsd: provider.costUsd ?? null,
    handoff: provider.handoff ?? ""
  }));
}

function normalizeProviderList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeRounds(value) {
  const rounds = Number(value ?? 2);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) {
    throw new Error("Rounds must be a whole number from 1 to 20.");
  }
  return rounds;
}

async function optionalLatestSnapshot(workspace, options) {
  try {
    return await guiRunSnapshot(workspace, options);
  } catch (error) {
    if (error.code === "ENOENT" || /No Artificial Orchestrator sessions found/.test(error.message)) return null;
    throw error;
  }
}

async function assertDirectory(path) {
  const info = await stat(path);
  if (!info.isDirectory()) throw new Error(`Workspace is not a directory: ${path}`);
}

async function readTail(path, maxChars) {
  const text = await readFile(path, "utf8");
  if (text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
}

function collectBlockers(status, final) {
  const values = [
    ...(Array.isArray(status?.blockers) ? status.blockers : []),
    ...(Array.isArray(final?.blockers) ? final.blockers : [])
  ];
  return [...new Set(values.map((value) => String(value?.blocker ?? value ?? "").trim()).filter(Boolean))];
}
