import { hydrateProvider, providerRegistry } from "./config.js";

export const BUILT_IN_ORGS = {
  "software-team": {
    id: "software-team",
    label: "Software Team",
    description: "A small AI engineering organization for planning, building, checking, and documenting software work.",
    pipeline: ["manager", "architect", "builder", "tester", "reviewer", "security", "docs"],
    roles: {
      manager: {
        provider: "openai",
        responsibility: "Break down the goal, keep the organization aligned, and decide whether the run should continue, finish, or block."
      },
      architect: {
        provider: "openai",
        responsibility: "Identify architecture direction, interfaces, risks, and implementation constraints."
      },
      builder: {
        provider: "codex",
        responsibility: "Implement or propose scoped code changes with senior engineering judgment."
      },
      tester: {
        provider: "openai",
        responsibility: "Define and review verification commands, test gaps, and acceptance evidence."
      },
      reviewer: {
        provider: "claude",
        responsibility: "Review behavior changes, regressions, maintainability risks, and missing checks."
      },
      security: {
        provider: "openai",
        responsibility: "Check for credential leaks, destructive actions, unsafe permissions, and policy-sensitive behavior."
      },
      docs: {
        provider: "openai",
        responsibility: "Ensure user-facing docs, examples, and handoffs explain the new behavior clearly."
      }
    },
    stopConditions: {
      doneStatuses: ["done"],
      blockedStatuses: ["blocked"]
    }
  }
};

export function listOrgs(config = {}) {
  return Object.values(orgRegistry(config)).sort((a, b) => a.id.localeCompare(b.id));
}

export function orgRegistry(config = {}) {
  return {
    ...BUILT_IN_ORGS,
    ...(config.orgs ?? {})
  };
}

export function resolveOrg({ config, orgName, runtime }) {
  const registry = orgRegistry(config);
  const org = registry[orgName];
  if (!org) throw new Error(`Unknown org "${orgName}". Run ao org list to see available organizations.`);

  const providers = providerRegistry(config);
  const pipeline = Array.isArray(org.pipeline) && org.pipeline.length ? org.pipeline : Object.keys(org.roles ?? {});
  const roles = pipeline.map((roleName) => {
    const role = org.roles?.[roleName];
    if (!role) throw new Error(`Org "${orgName}" references missing role "${roleName}".`);

    const providerId = role.provider;
    const providerSpec = providers[providerId];
    if (!providerSpec) throw new Error(`Org "${orgName}" role "${roleName}" references unknown provider "${providerId}".`);

    const provider = hydrateProvider(providerSpec, runtime);
    return {
      ...provider,
      id: roleName,
      providerId,
      baseProviderId: provider.id,
      label: role.label ?? `${titleCase(roleName)} (${provider.label ?? providerId})`,
      role: roleName,
      orgRole: roleName,
      orgId: org.id,
      responsibility: role.responsibility ?? provider.role ?? "Collaborate with the organization."
    };
  });

  return {
    ...org,
    roleSpecs: org.roles,
    roles,
    pipeline
  };
}

export function orgSummary(org) {
  return [
    `${org.id}\t${org.label ?? org.id}`,
    ...(org.pipeline ?? []).map((roleName) => {
      const role = Array.isArray(org.roles)
        ? org.roles.find((item) => item.orgRole === roleName || item.role === roleName)
        : org.roles?.[roleName];
      return `  ${roleName}\t${role?.provider ?? role?.providerId ?? "unknown"}\t${role?.responsibility ?? ""}`;
    })
  ].join("\n");
}

function titleCase(value) {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
