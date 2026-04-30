import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const BUILT_IN_PROVIDERS = {
  claude: {
    id: "claude",
    label: "Claude",
    kind: "claude",
    role: "architect",
    color: "magenta"
  },
  codex: {
    id: "codex",
    label: "Codex",
    kind: "codex",
    role: "builder",
    color: "blue"
  }
};

export async function loadConfig({ workspace, configPath }) {
  const path = await findConfig(workspace, configPath);
  if (!path) return { path: null, pipeline: null, providers: {} };

  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  return {
    path,
    pipeline: Array.isArray(parsed.pipeline) ? parsed.pipeline : null,
    providers: normalizeProviders(parsed.providers)
  };
}

export function resolveProviders({ config, providerList, codexOnly, claudeOnly, runtime }) {
  const registry = {
    ...BUILT_IN_PROVIDERS,
    ...(config?.providers ?? {})
  };

  let ids = providerList ? splitList(providerList) : config?.pipeline;
  if (!ids || ids.length === 0) ids = ["claude", "codex"];
  if (codexOnly) ids = ["codex"];
  if (claudeOnly) ids = ["claude"];

  return ids.map((id) => {
    const spec = registry[id];
    if (!spec) throw new Error(`Unknown provider "${id}". Add it to artificial-orchestrator.config.json or use one of: ${Object.keys(registry).join(", ")}`);

    return hydrateProvider(spec, runtime);
  });
}

export function splitList(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProviders(providers) {
  if (!providers) return {};

  if (Array.isArray(providers)) {
    return Object.fromEntries(providers.map((provider) => [provider.id, provider]));
  }

  return Object.fromEntries(
    Object.entries(providers).map(([id, provider]) => [id, { id, ...provider }])
  );
}

function hydrateProvider(spec, runtime) {
  const provider = {
    ...spec,
    workspace: runtime.workspace,
    timeoutMs: Number(spec.timeoutMs ?? runtime.timeoutMs)
  };

  if (provider.kind === "codex") {
    provider.model = runtime.codexModel;
    provider.apply = runtime.apply;
    provider.unsafe = runtime.unsafe;
  }

  if (provider.kind === "claude") {
    provider.model = runtime.claudeModel;
    provider.maxBudgetUsd = runtime.maxBudgetUsd;
    provider.allowTools = runtime.claudeTools;
  }

  return provider;
}

async function findConfig(workspace, configPath) {
  const candidates = configPath
    ? [resolve(String(configPath))]
    : [
        join(workspace, "artificial-orchestrator.config.json"),
        join(process.cwd(), "artificial-orchestrator.config.json")
      ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}
