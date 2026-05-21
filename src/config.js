import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const BUILT_IN_PROVIDERS = {
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    role: "generalist",
    model: "gpt-5.5",
    reasoning: "medium",
    responseFormat: "json",
    color: "green"
  },
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
  if (!path) return { path: null, pipeline: null, providers: {}, orgs: {} };

  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  return {
    path,
    pipeline: Array.isArray(parsed.pipeline) ? parsed.pipeline : null,
    providers: normalizeProviders(parsed.providers),
    orgs: normalizeOrgs(parsed.orgs)
  };
}

export function resolveProviders({ config, providerList, codexOnly, claudeOnly, runtime }) {
  const registry = providerRegistry(config);

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

export function providerRegistry(config) {
  return {
    ...BUILT_IN_PROVIDERS,
    ...(config?.providers ?? {})
  };
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

function normalizeOrgs(orgs) {
  if (!orgs) return {};

  if (Array.isArray(orgs)) {
    return Object.fromEntries(orgs.map((org) => [org.id, org]));
  }

  return Object.fromEntries(
    Object.entries(orgs).map(([id, org]) => [id, { id, ...org }])
  );
}

export function hydrateProvider(spec, runtime) {
  const provider = {
    ...spec,
    workspace: runtime.workspace,
    goal: runtime.goal ?? spec.goal ?? "",
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

  if (provider.kind === "openai") {
    provider.model = runtime.openaiModel ?? spec.model ?? "gpt-5.5";
    provider.reasoning = runtime.openaiReasoning ?? spec.reasoning ?? "medium";
    provider.maxOutputTokens = Number(runtime.openaiMaxOutputTokens ?? spec.maxOutputTokens ?? 4096);
    provider.responseFormat = spec.responseFormat ?? "json";
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
