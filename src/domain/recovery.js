import { compactLine } from "../shared/text.js";

const PHASES = new Set(["idle", "running", "done", "blocked", "rounds_exhausted", "unknown"]);

export function recoveryCenterForRun(run = null) {
  if (!run) {
    return {
      phase: "idle",
      severity: "neutral",
      title: "No run loaded",
      summary: "Start a run or choose a recent session to see recovery guidance.",
      nextSteps: ["Select a project, enter a goal, and start a run."],
      files: []
    };
  }

  const phase = normalizePhase(run.phase);
  const blockers = cleanBlockers(run.blockers);
  const blockedProviders = blockedProviderIds(run.providers);
  const files = recoveryFiles(run.files, phase);
  const handoffAvailable = Boolean(String(run.latestHandoff ?? run.handoff ?? "").trim());

  if (phase === "running") {
    return {
      phase,
      severity: "info",
      title: "Run in progress",
      summary: runningSummary(run),
      nextSteps: [
        "Watch the transcript for new provider turns.",
        "Open provider-state.json if a provider stalls, reports limits, or stops responding.",
        "Wait for the run to finish as done, blocked, or rounds exhausted."
      ],
      files
    };
  }

  if (phase === "blocked") {
    return {
      phase,
      severity: "danger",
      title: "Run blocked",
      summary: blockedSummary(blockers, blockedProviders),
      nextSteps: blockedSteps(blockers, handoffAvailable),
      files
    };
  }

  if (phase === "rounds_exhausted") {
    return {
      phase,
      severity: "warning",
      title: "Round limit reached",
      summary: "The configured round limit ended before a provider reported done.",
      nextSteps: [
        handoffAvailable ? "Open handoff.md and use the latest handoff as follow-up context." : "Open transcript.md to find the last useful provider output.",
        "Increase rounds or start a focused follow-up run from the same project.",
        "Open status.json to confirm the final round and provider."
      ],
      files
    };
  }

  if (phase === "done") {
    return {
      phase,
      severity: "success",
      title: "Run complete",
      summary: "The orchestration finished with a done phase.",
      nextSteps: [
        "Review transcript.md before relying on the result.",
        handoffAvailable ? "Open handoff.md for the concise final context." : "Open status.json for the final run result.",
        "Inspect provider-state.json if you need usage, limits, or provider timing."
      ],
      files
    };
  }

  return {
    phase,
    severity: "neutral",
    title: "Run state unknown",
    summary: "The latest durable files do not expose a recognized run phase.",
    nextSteps: ["Open status.json and transcript.md to inspect the saved session manually."],
    files
  };
}

function normalizePhase(value) {
  const phase = String(value ?? "unknown").toLowerCase().replace(/-/g, "_");
  return PHASES.has(phase) ? phase : "unknown";
}

function cleanBlockers(blockers = []) {
  return (Array.isArray(blockers) ? blockers : [blockers]).map((blocker) => compactLine(blocker, 220)).filter(Boolean);
}

function blockedProviderIds(providers = []) {
  return (Array.isArray(providers) ? providers : [])
    .filter((provider) => provider?.state === "blocked" || provider?.ok === false)
    .map((provider) => String(provider.id ?? "").trim())
    .filter(Boolean);
}

function runningSummary(run) {
  const active = String(run.activeRole ?? "").trim();
  if (active) return `${active} is the latest active provider or role.`;
  return "The desktop app is polling durable status and transcript updates.";
}

function blockedSummary(blockers, blockedProviders) {
  const subject = blockedProviders.length > 0 ? blockedProviders.join(", ") : "A provider or role";
  if (blockers.length === 0) return `${subject} stopped the run without a specific public blocker.`;
  if (blockers.length === 1) return `${subject} stopped on: ${blockers[0]}`;
  return `${subject} stopped with ${blockers.length} blockers.`;
}

function blockedSteps(blockers, handoffAvailable) {
  const first = blockers[0] ? `Resolve blocker: ${blockers[0]}` : "Resolve the provider or organization blocker shown in status.json.";
  return [
    first,
    "Open provider-state.json to inspect provider limits, auth, usage, and last handoff.",
    handoffAvailable ? "Use handoff.md as the resume context after the blocker is fixed." : "Use transcript.md to recover the last useful provider output.",
    "Start a new run only after auth, quota, payment, or workspace issues are corrected."
  ];
}

function recoveryFiles(files = {}, phase) {
  const definitions = {
    transcript: ["Transcript", "Full provider output and final summary."],
    status: ["Status", "Current phase, final result, blockers, and provider summary."],
    handoff: ["Handoff", "Concise context for follow-up or resume work."],
    providerState: ["Provider state", "Provider limits, usage, last rounds, and handoffs."],
    orgState: ["Organization state", "Role statuses and organization blockers."]
  };
  const priority = filePriority(phase);

  return priority
    .filter((key) => files[key])
    .map((key) => ({
      key,
      label: definitions[key][0],
      detail: definitions[key][1],
      path: files[key]
    }));
}

function filePriority(phase) {
  if (phase === "blocked") return ["providerState", "status", "handoff", "transcript", "orgState"];
  if (phase === "rounds_exhausted") return ["handoff", "transcript", "status", "providerState", "orgState"];
  if (phase === "running") return ["transcript", "status", "providerState", "handoff", "orgState"];
  if (phase === "done") return ["transcript", "handoff", "status", "providerState", "orgState"];
  return ["status", "transcript", "providerState", "handoff", "orgState"];
}
