import { loadConfig, resolveProviders } from "../config.js";
import { resolveOrg } from "../orgs.js";
import { resolveProjectContext } from "../projects.js";
import { runtimeOptions } from "../runtime.js";
import { assertWorkspaceDirectory } from "../shared/workspace.js";

export const DEFAULT_HISTORY_CHARS = 12000;

export async function prepareRunOptions(input = {}) {
  const goal = normalizeGoal(input.goal);
  const rounds = normalizeRounds(input.rounds);
  const projectContext =
    input.projectContext ??
    (await resolveProjectContext({
      projectName: input.projectName || undefined,
      workspace: input.workspace || undefined,
      registryPath: input.registryPath,
      cwd: input.cwd
    }));
  await assertWorkspaceDirectory(projectContext.path);

  const config = input.config ?? (await loadConfig({ workspace: projectContext.path, configPath: input.configPath }));
  const runtime = input.runtime ?? runtimeOptions(input, projectContext.path);
  const orgName = String(input.orgName ?? "").trim();
  const org = orgName ? resolveOrg({ config, orgName, runtime }) : null;
  const providerList = normalizeProviderList(input.providerIds ?? input.providers);
  const providers = org
    ? []
    : resolveProviders({
        config,
        providerList: providerList.length > 0 ? providerList.join(",") : undefined,
        codexOnly: Boolean(input.codexOnly),
        claudeOnly: Boolean(input.claudeOnly),
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

export function normalizeGoal(value) {
  const goal = String(value ?? "").trim();
  if (!goal) throw new Error("Enter a goal before starting a run.");
  return goal;
}

export function normalizeRounds(value) {
  const rounds = Number(value ?? 2);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) {
    throw new Error("Rounds must be a whole number from 1 to 20.");
  }
  return rounds;
}

export function normalizeProviderList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
