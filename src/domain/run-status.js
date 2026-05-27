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

function textStatus(text) {
  const match = String(text ?? "").match(/\bStatus:\s*(done|blocked|continue)\b/i);
  return match ? match[1].toLowerCase() : null;
}
