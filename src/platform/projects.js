import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";

const DEFAULT_REGISTRY = {
  version: 1,
  active: null,
  projects: {}
};

export function projectRegistryPath(customPath, env = process.env) {
  if (customPath) return resolve(String(customPath));

  const home = env.ARTIFICIAL_ORCHESTRATOR_HOME ?? env.AO_HOME;
  if (home) return join(resolve(String(home)), "projects.json");

  const base =
    platform() === "win32" && env.APPDATA
      ? join(env.APPDATA, "artificial-orchestrator")
      : join(homedir(), ".config", "artificial-orchestrator");

  return join(base, "projects.json");
}

export async function loadProjectRegistry(options = {}) {
  const path = projectRegistryPath(options.registryPath, options.env);

  try {
    const raw = await readFile(path, "utf8");
    return normalizeRegistry(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") return structuredClone(DEFAULT_REGISTRY);
    throw error;
  }
}

export async function saveProjectRegistry(registry, options = {}) {
  const path = projectRegistryPath(options.registryPath, options.env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalizeRegistry(registry), null, 2)}\n`, "utf8");
}

export async function addProject({ name, path, registryPath, setActive = false }) {
  const projectName = normalizeProjectName(name);
  const projectPath = resolve(String(path ?? process.cwd()));
  const registry = await loadProjectRegistry({ registryPath });
  const existing = registry.projects[projectName];
  const now = new Date().toISOString();

  const project = {
    name: projectName,
    path: projectPath,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now
  };

  registry.projects[projectName] = project;
  if (setActive || !registry.active) registry.active = projectName;

  await saveProjectRegistry(registry, { registryPath });
  return { project, registry };
}

export async function listProjects(options = {}) {
  const registry = await loadProjectRegistry(options);
  return Object.values(registry.projects).sort((a, b) => a.name.localeCompare(b.name));
}

export async function useProject({ name, registryPath }) {
  const projectName = normalizeProjectName(name);
  const registry = await loadProjectRegistry({ registryPath });
  const project = registry.projects[projectName];
  if (!project) throw new Error(`Unknown project "${projectName}". Run ao project list to see configured projects.`);

  registry.active = projectName;
  await saveProjectRegistry(registry, { registryPath });
  return { project, registry };
}

export async function currentProject(options = {}) {
  const registry = await loadProjectRegistry(options);
  if (!registry.active) return null;
  return registry.projects[registry.active] ?? null;
}

export async function resolveProjectContext({ projectName, workspace, registryPath, cwd = process.cwd() }) {
  const registry = await loadProjectRegistry({ registryPath });

  if (projectName) {
    const name = normalizeProjectName(projectName);
    const project = registry.projects[name];
    if (!project) throw new Error(`Unknown project "${name}". Run ao project add ${name} --path <path> first.`);
    return { name: project.name, path: project.path, source: "named" };
  }

  if (workspace) {
    const path = resolve(String(workspace));
    const project = findProjectByPath(registry, path);
    return {
      name: project?.name ?? "(unregistered)",
      path,
      source: project ? "registered-workspace" : "workspace"
    };
  }

  const active = registry.active ? registry.projects[registry.active] : null;
  if (active) return { name: active.name, path: active.path, source: "active" };

  return { name: "(current working directory)", path: resolve(cwd), source: "cwd" };
}

export function normalizeProjectName(name) {
  const value = String(name ?? "").trim();
  if (!value) throw new Error("Missing project name.");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) {
    throw new Error("Project names must start with a letter or number and contain only letters, numbers, dots, dashes, or underscores.");
  }
  return value;
}

function normalizeRegistry(registry) {
  const normalized = {
    ...DEFAULT_REGISTRY,
    ...(registry ?? {}),
    projects: {}
  };

  for (const [name, project] of Object.entries(registry?.projects ?? {})) {
    const projectName = normalizeProjectName(project?.name ?? name);
    normalized.projects[projectName] = {
      name: projectName,
      path: resolve(String(project?.path ?? ".")),
      addedAt: project?.addedAt ?? null,
      updatedAt: project?.updatedAt ?? null
    };
  }

  if (normalized.active && !normalized.projects[normalized.active]) normalized.active = null;
  return normalized;
}

function findProjectByPath(registry, path) {
  const resolved = resolve(path);
  return Object.values(registry.projects).find((project) => resolve(project.path) === resolved) ?? null;
}
