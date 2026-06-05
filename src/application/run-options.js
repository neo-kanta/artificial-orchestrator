import { hydrateProvider, loadConfig, providerRegistry, resolveProviders } from "../config.js";
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
  const agentRoles = normalizeAgentRoles(input.agentRoles);
  const org = agentRoles.length > 0
    ? customOrgFromAgentRoles({ roles: agentRoles, label: input.agentOrgLabel, config, runtime })
    : orgName
      ? resolveOrg({ config, orgName, runtime })
      : null;
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
    sharedContext: input.sharedContext !== false,
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

export function normalizeAgentRoles(value) {
  const roles = Array.isArray(value) ? value : [];
  const seen = new Set();
  return roles
    .map((role, index) => {
      const label = String(role?.label ?? role?.id ?? `Agent ${index + 1}`).trim() || `Agent ${index + 1}`;
      const baseId = safeRoleId(role?.id ?? label);
      const id = uniqueRoleId(baseId, seen);
      seen.add(id);
      return {
        id,
        label,
        providerId: String(role?.providerId ?? role?.provider ?? "").trim(),
        model: String(role?.model ?? "").trim(),
        responsibility: String(role?.responsibility ?? "").trim()
      };
    })
    .filter((role) => role.providerId);
}

function customOrgFromAgentRoles({ roles, label, config, runtime }) {
  const providers = providerRegistry(config);
  const hydratedRoles = roles.map((role) => {
    const providerSpec = providers[role.providerId];
    if (!providerSpec) {
      throw new Error(`Agent role "${role.label}" references unknown provider "${role.providerId}".`);
    }

    const provider = hydrateProvider(providerSpec, runtime);
    if (role.model) provider.model = role.model;

    return {
      ...provider,
      id: role.id,
      providerId: role.providerId,
      baseProviderId: provider.id,
      label: role.label,
      role: role.id,
      orgRole: role.id,
      orgId: "desktop-custom-team",
      responsibility: role.responsibility || provider.role || "Collaborate with the organization."
    };
  });

  return {
    id: "desktop-custom-team",
    label: String(label ?? "").trim() || "Custom Agent Team",
    description: "A custom desktop-composed AI organization.",
    pipeline: hydratedRoles.map((role) => role.id),
    roles: hydratedRoles,
    roleSpecs: Object.fromEntries(
      hydratedRoles.map((role) => [
        role.id,
        {
          provider: role.providerId,
          label: role.label,
          model: role.model ?? null,
          responsibility: role.responsibility
        }
      ])
    ),
    stopConditions: {
      doneStatuses: ["done"],
      blockedStatuses: ["blocked"]
    }
  };
}

function safeRoleId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "agent";
}

function uniqueRoleId(base, seen) {
  const safeBase = safeRoleId(base);
  let id = safeBase;
  let suffix = 2;
  while (seen.has(id)) {
    id = `${safeBase}-${suffix}`;
    suffix += 1;
  }
  return id;
}
