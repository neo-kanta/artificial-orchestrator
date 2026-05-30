import { compactText } from "../shared/text.js";

export const RUN_STATUSES = new Set(["running", "done", "blocked", "rounds_exhausted"]);
export const PROVIDER_STATUSES = new Set(["done", "blocked", "continue"]);

export function normalizeFinalStatus(status) {
  const value = String(status ?? "").toLowerCase();
  if (value === "done" || value === "blocked" || value === "rounds_exhausted") return value;
  return "blocked";
}

export function structuredStatus(value) {
  const status = String(value ?? "").toLowerCase();
  return PROVIDER_STATUSES.has(status) ? status : null;
}

export function reportedStatus(text) {
  const match = String(text ?? "").match(/\b(?:DUET_STATUS|ORCHESTRATOR_STATUS|Status):\s*(done|blocked|continue)\b/i);
  return match ? match[1].toLowerCase() : null;
}

export function providerStatusFromResult(result) {
  return structuredStatus(result.structured?.status) ?? textStatus(result.text) ?? (result.ok ? "continue" : "blocked");
}

export function collectBlockers(status = {}, final = null) {
  const values = [
    ...(Array.isArray(status?.blockers) ? status.blockers : []),
    ...(Array.isArray(final?.blockers) ? final.blockers : [])
  ];
  return [...new Set(values.map((value) => String(value?.blocker ?? value ?? "").trim()).filter(Boolean))];
}

export function terminalBlockers(turn) {
  const values = [
    ...(Array.isArray(turn.blockers) ? turn.blockers : []),
    ...(Array.isArray(turn.errors) ? turn.errors : []),
    turn.limit ? `Provider limit reset: ${turn.limit.reset}` : null,
    turn.stderr,
    turn.text
  ];

  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .map((value) => compactText(value, 500));
}

export function publicProviderState(status = {}, providerState = {}) {
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

export function publicOrgState(orgState = null) {
  if (!orgState) return null;

  const roles = orgState.roles ?? {};
  const pipeline = Array.isArray(orgState.org?.pipeline) ? orgState.org.pipeline : [];
  const roleIds = [...pipeline, ...Object.keys(roles).filter((id) => !pipeline.includes(id))];

  return {
    id: orgState.org?.id ?? null,
    label: orgState.org?.label ?? orgState.org?.id ?? null,
    phase: orgState.phase ?? null,
    pipeline,
    roles: roleIds.map((id) => publicOrgRole(id, roles[id])),
    blockers: publicOrgBlockers(orgState.blockers),
    finalDecision: orgState.finalDecision
      ? {
          role: orgState.finalDecision.role ?? null,
          provider: orgState.finalDecision.provider ?? null,
          at: orgState.finalDecision.at ?? null
        }
      : null
  };
}

function textStatus(text) {
  const match = String(text ?? "").match(/\bStatus:\s*(done|blocked|continue)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function publicOrgRole(id, role = null) {
  return {
    id,
    provider: role?.provider ?? null,
    ok: role?.ok ?? null,
    status: role?.status ?? (role ? (role.ok === false ? "blocked" : "continue") : "pending"),
    lastRound: role?.lastRound ?? null,
    lastAt: role?.lastAt ?? null,
    blockers: cleanBlockers(role?.blockers)
  };
}

function publicOrgBlockers(blockers = []) {
  const entries = Array.isArray(blockers) ? blockers : [];
  return entries.flatMap((entry) =>
    cleanBlockers(entry?.blockers).map((blocker) => ({
      role: entry?.role ?? null,
      provider: entry?.provider ?? null,
      at: entry?.at ?? null,
      blocker
    }))
  );
}

function cleanBlockers(values = []) {
  return (Array.isArray(values) ? values : [values])
    .map((value) => compactText(String(value ?? "").trim(), 300))
    .filter(Boolean);
}
