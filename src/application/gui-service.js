import { resolve } from "node:path";
import { loadConfig, providerRegistry } from "../config.js";
import { listOrgs } from "../orgs.js";
import { runDuet } from "../orchestrator.js";
import { addProject, currentProject, listProjects, useProject } from "../projects.js";
import { latestStatus } from "../status.js";
import { collectBlockers, publicProviderState } from "../domain/run-status.js";
import { prepareRunOptions } from "./run-options.js";
import { assertDirectory, readTail } from "../shared/workspace.js";

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

export async function guiRunSnapshot(workspace, options = {}) {
  const run = await latestStatus(workspace);
  const transcript = await readTail(run.files.transcript, Number(options.maxTranscriptChars ?? DEFAULT_TRANSCRIPT_CHARS));
  const handoff = await readTail(run.files.handoff, Number(options.maxHandoffChars ?? 6000));
  const phase = run.status?.phase ?? run.providerState?.phase ?? "unknown";
  const final = run.status?.final ?? run.providerState?.final ?? null;

  return {
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
    pipeline: org.pipeline ?? [],
    roles: publicOrgRoles(org),
    edges: publicOrgEdges(org)
  }));
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
