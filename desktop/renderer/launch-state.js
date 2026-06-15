export function validateLaunch(input = {}, context = {}) {
  const errors = [];
  const goal = String(input.goal ?? "").trim();
  const rounds = Number(input.rounds);
  const providers = normalizeList(input.providerIds);
  const agentRoles = normalizeAgentRoles(context.agentRoles);

  if (!context.project) errors.push("Select a project before starting.");
  if (!goal) errors.push("Enter a goal before starting.");
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) errors.push("Rounds must be a whole number from 1 to 20.");
  if (!input.orgName && providers.length === 0 && agentRoles.length === 0) {
    errors.push("Select at least one provider, custom agent, or organization preset.");
  }

  return {
    ok: errors.length === 0,
    errors,
    message: errors[0] ?? "Ready to start."
  };
}

export function launchSteps(input = {}, context = {}, processState = {}) {
  const validation = validateLaunch(input, context);
  const activeRun = processState.activeRun ?? null;
  const goal = String(input.goal ?? "").trim();
  const hasTeam = Boolean(input.orgName) || normalizeList(input.providerIds).length > 0 || normalizeAgentRoles(context.agentRoles).length > 0;

  return [
    step("Project", Boolean(context.project), context.project ? context.project.name : "Choose workspace."),
    step("Goal", Boolean(goal), goal ? compactGoal(goal) : "Describe outcome."),
    step("Team", hasTeam, teamLabel(input, context)),
    step(activeRun ? "Monitor" : "Start", Boolean(activeRun) || validation.ok, activeRun ? "Run is active." : validation.ok ? "Ready." : validation.message)
  ];
}

export function launchActionLabel(input = {}, context = {}, processState = {}) {
  if (processState.activeRun) return "Run active";
  const validation = validateLaunch(input, context);
  if (validation.ok) return "Start run";
  const first = validation.errors[0] ?? "";
  if (/project/i.test(first)) return "Select project";
  if (/goal/i.test(first)) return "Enter goal";
  if (/Rounds/i.test(first)) return "Fix rounds";
  if (/provider|custom agent|organization/i.test(first)) return "Choose team";
  return "Start run";
}

export function launchSummary(input = {}, context = {}) {
  const providers = normalizeList(input.providerIds);
  const org = findById(context.orgs, input.orgName);
  const agentRoles = normalizeAgentRoles(context.agentRoles);
  const project = context.project ?? null;
  const rounds = Number.isInteger(Number(input.rounds)) && Number(input.rounds) > 0 ? Number(input.rounds) : 2;
  const permission = permissionSummary(input.permissionPolicy);

  return [
    {
      label: "Project",
      value: project ? project.name : "No project selected",
      detail: project?.path ?? "Choose or add a workspace."
    },
    {
      label: org ? "Organization" : agentRoles.length > 0 ? "Custom agents" : "Providers",
      value: org ? org.label : agentRoles.length > 0 ? agentLabels(agentRoles) : providerLabels(providers, context.providers),
      detail: org
        ? `${org.roles?.length ?? 0} roles in preset order.`
        : agentRoles.length > 0
          ? "Custom roster controls role order and models."
          : "Providers run in selected order."
    },
    {
      label: "Run shape",
      value: `${rounds} ${rounds === 1 ? "round" : "rounds"}`,
      detail: permission.detail
    },
    {
      label: "Permissions",
      value: permission.label,
      detail: input.claudeTools ? "Claude tools enabled." : "Claude tools disabled."
    }
  ];
}

export function selectedProviderNotice(input = {}) {
  if (input.orgName) return "Organization presets control provider order. Provider choices are locked for this run.";
  return "Select providers in the order they should hand off work.";
}

function providerLabels(providerIds, providers = []) {
  if (providerIds.length === 0) return "No providers selected";
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  return providerIds
    .map((id) => {
      const provider = providerById.get(id);
      return provider?.label ?? id;
    })
    .join(" -> ");
}

function agentLabels(agentRoles) {
  return agentRoles.map((role) => role.label || role.id).join(" -> ");
}

function step(label, complete, detail) {
  return {
    label,
    status: complete ? "done" : "todo",
    detail
  };
}

function teamLabel(input, context) {
  const org = findById(context.orgs, input.orgName);
  if (org) return org.label;
  const agentRoles = normalizeAgentRoles(context.agentRoles);
  if (agentRoles.length > 0) return agentLabels(agentRoles);
  const providers = normalizeList(input.providerIds);
  if (providers.length > 0) return providerLabels(providers, context.providers);
  return "Choose team.";
}

function compactGoal(goal) {
  const text = String(goal ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= 44) return text;
  return `${text.slice(0, 41)}...`;
}

function permissionSummary(policy) {
  if (policy === "trusted") {
    return {
      label: "Trusted full access",
      detail: "Applies changes with unsafe mode in trusted worktrees."
    };
  }
  if (policy === "workspace") {
    return {
      label: "Edit workspace",
      detail: "Applies changes inside the selected project."
    };
  }
  return {
    label: "Plan only",
    detail: "No workspace edits."
  };
}

function findById(items = [], id) {
  return items.find((item) => item.id === id) ?? null;
}

function normalizeList(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function normalizeAgentRoles(value) {
  return Array.isArray(value)
    ? value
        .map((role) => ({
          id: String(role?.id ?? "").trim(),
          label: String(role?.label ?? role?.id ?? "").trim()
        }))
        .filter((role) => role.id || role.label)
    : [];
}
