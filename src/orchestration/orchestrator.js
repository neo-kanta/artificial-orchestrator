import { appendTurn, createSession, finalizeSession, readOrgContext, readProviderContext } from "./session-store.js";
import { callProvider } from "../providers/index.js";
import { usageLine } from "../providers/parsers.js";
import { providerPrompt } from "./prompts.js";
import { workspaceSnapshot } from "../platform/snapshot.js";
import { color } from "../shared/ansi.js";
import { assertWorkspaceDirectory } from "../shared/workspace.js";
import { providerStatusFromResult, reportedStatus, structuredStatus, terminalBlockers } from "../domain/run-status.js";

export async function runDuet(options) {
  await assertWorkspaceDirectory(options.workspace);
  const session = await createSession(options.workspace, options.goal, { project: options.project, org: options.org });
  const history = [];
  const pipeline = options.org ? options.org.roles : options.providers;
  const call = options.callProvider ?? callProvider;

  console.log(color("bold", "Artificial Orchestrator"));
  console.log(`session: ${session.dir}`);
  if (options.project) console.log(`project: ${options.project.name}`);
  if (options.org) console.log(`organization: ${options.org.id}`);
  console.log(`workspace: ${options.workspace}`);
  console.log(`mode: ${options.apply ? "apply" : "plan"}\n`);
  console.log(`pipeline: ${pipeline.map((provider) => provider.id).join(" -> ")}\n`);

  for (let round = 1; round <= options.rounds; round += 1) {
    const snapshot = await workspaceSnapshot(options.workspace);

    for (const provider of pipeline) {
      const providerState = await readProviderContext(session, options.historyChars);
      const orgState = await readOrgContext(session, options.historyChars);
      const durableState = { ...providerState, orgState };
      const turn = await runProviderTurn({
        session,
        round,
        provider,
        fn: () => {
          const prompt = providerPrompt({
            provider,
            goal: options.goal,
            round,
            workspaceSnapshot: snapshot,
            history: compactHistory(history, options.historyChars),
            durableState,
            apply: options.apply,
            sharedContext: options.sharedContext !== false
          });

          return callProviderWithFallbacks({ provider, prompt, call });
        },
        history
      });

      const terminal = options.org
        ? orgTerminalStatus(options.org, turn)
        : providerTerminalStatus(turn);
      if (terminal) {
        await finalizeSession(session, terminal);
        console.log(color(terminal.status === "done" ? "green" : "yellow", `\nORCHESTRATOR_STATUS: ${terminal.status}`));
        printSessionFiles(session);
        return session;
      }
    }
  }

  await finalizeSession(session, {
    status: "rounds_exhausted",
    reason: "round-limit-reached",
    blockers: [`Stopped after ${options.rounds} round(s) without a done or blocked status.`]
  });
  console.log(color("yellow", "\nORCHESTRATOR_STATUS: rounds_exhausted"));
  printSessionFiles(session);
  return session;
}

async function callProviderWithFallbacks({ provider, prompt, call }) {
  const attempts = [provider, ...(provider.fallbackProviders ?? [])];
  const failures = [];

  for (const candidate of attempts) {
    const result = await safeProviderCall(call, candidate, prompt);
    if (result.ok) {
      return failures.length === 0
        ? result
        : annotateFallbackSuccess({ result, requested: provider, used: candidate, failures });
    }

    failures.push(providerFailure(candidate, result));
  }

  const last = failures.at(-1)?.result ?? {
    ok: false,
    text: "Provider unavailable.",
    usage: null,
    costUsd: null,
    limit: null,
    errors: ["Provider unavailable."],
    stderr: "",
    durationMs: 0
  };

  return failures.length <= 1 ? last : annotateFallbackFailure({ result: last, requested: provider, failures });
}

async function safeProviderCall(call, provider, prompt) {
  try {
    return await call(provider, prompt);
  } catch (error) {
    return {
      provider: provider.id,
      ok: false,
      code: null,
      text: error?.message ?? String(error),
      usage: null,
      costUsd: null,
      limit: null,
      errors: [error?.message ?? String(error)],
      stderr: "",
      durationMs: 0
    };
  }
}

function annotateFallbackSuccess({ result, requested, used, failures }) {
  const notice = fallbackNotice({ requested, used, failures, success: true });
  return {
    ...result,
    text: `${notice}\n\n${result.text || "(no fallback output)"}`,
    fallback: {
      requestedProvider: requested.id,
      usedProvider: used.id,
      failures: failures.map(publicFailure)
    }
  };
}

function annotateFallbackFailure({ result, requested, failures }) {
  const notice = fallbackNotice({ requested, used: null, failures, success: false });
  return {
    ...result,
    text: `${notice}\n\n${result.text || "(no output)"}`,
    fallback: {
      requestedProvider: requested.id,
      usedProvider: null,
      failures: failures.map(publicFailure)
    }
  };
}

function fallbackNotice({ requested, used, failures, success }) {
  const title = success
    ? `Fallback provider used for ${requested.id}: ${used.id}`
    : `All fallback providers failed for ${requested.id}`;
  const lines = failures.map((failure) => `- ${failure.provider}: ${failure.reason}`);
  return [
    title,
    "Primary/fallback failure summary:",
    ...lines
  ].join("\n");
}

function providerFailure(provider, result) {
  return {
    provider: provider.id,
    reason: compactFailureReason(result),
    result
  };
}

function compactFailureReason(result) {
  if (result?.limit?.reset) return `limit reset ${result.limit.reset}`;
  const text = String(result?.errors?.[0] ?? result?.stderr ?? result?.text ?? "provider unavailable").trim();
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function publicFailure(failure) {
  return {
    provider: failure.provider,
    reason: failure.reason
  };
}

async function runProviderTurn({ session, round, provider, fn, history }) {
  process.stdout.write(color("cyan", `[round ${round}] ${provider.id} thinking... `));
  const result = await fn();
  const line = usageLine(result.usage);
  const status = result.ok ? color("green", "ok") : color("yellow", "blocked");
  console.log(`${status} (${Math.round(result.durationMs / 1000)}s, ${line})`);

  if (result.limit) {
    console.log(color("yellow", `${provider.id} limit reset: ${result.limit.reset}`));
  }

  if (result.fallback?.usedProvider) {
    console.log(color("yellow", `${provider.id} fallback used: ${result.fallback.usedProvider}`));
  }

  const text = result.text || "(no output)";
  console.log(color(provider.color ?? "cyan", `\n${provider.label ?? provider.id}`.toUpperCase()));
  console.log(text);
  console.log("");

  const turn = {
    round,
    provider: provider.id,
    providerId: provider.providerId ?? provider.id,
    providerKind: provider.kind,
    role: provider.orgRole ?? null,
    orgStatus: orgStatus(result),
    blockers: orgBlockers(result),
    ok: result.ok,
    text,
    structured: result.structured ?? null,
    usage: result.usage ?? null,
    usageLine: line,
    costUsd: result.costUsd ?? null,
    limit: result.limit ?? null,
    fallback: result.fallback ?? null,
    errors: result.errors ?? [],
    stderr: result.stderr ?? "",
    durationMs: result.durationMs
  };

  await appendTurn(session, turn);
  history.push({ round, provider: provider.id, text });
  return turn;
}

function compactHistory(history, maxChars) {
  const text = history
    .slice(-6)
    .map((entry) => `Round ${entry.round} ${entry.provider}:\n${entry.text}`)
    .join("\n\n");

  if (text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
}

function orgStatus(result) {
  return providerStatusFromResult(result);
}

function orgBlockers(result) {
  if (Array.isArray(result.structured?.blockers)) return result.structured.blockers;
  return result.ok ? [] : [String(result.text ?? "provider failed").trim()];
}

function providerTerminalStatus(turn) {
  if (!turn.ok) {
    return {
      status: "blocked",
      reason: "provider-blocked",
      provider: turn.provider,
      round: turn.round,
      blockers: terminalBlockers(turn)
    };
  }

  const status = structuredStatus(turn.structured?.status) ?? reportedStatus(turn.text);
  if (status === "done" || status === "blocked") {
    return {
      status,
      reason: `provider-reported-${status}`,
      provider: turn.provider,
      round: turn.round,
      blockers: status === "blocked" ? terminalBlockers(turn) : []
    };
  }

  return null;
}

function orgTerminalStatus(org, turn) {
  if (!turn.ok) {
    return {
      status: "blocked",
      reason: "provider-blocked",
      provider: turn.provider,
      round: turn.round,
      blockers: terminalBlockers(turn)
    };
  }

  if (!shouldStopOrg(org, turn.orgStatus)) return null;
  return {
    status: turn.orgStatus,
    reason: `organization-${turn.orgStatus}`,
    provider: turn.provider,
    round: turn.round,
    blockers: turn.orgStatus === "blocked" ? terminalBlockers(turn) : []
  };
}

function shouldStopOrg(org, status) {
  const done = org.stopConditions?.doneStatuses ?? ["done"];
  const blocked = org.stopConditions?.blockedStatuses ?? ["blocked"];
  return done.includes(status) || blocked.includes(status);
}

function printSessionFiles(session) {
  console.log(`\nTranscript: ${session.dir}\\transcript.md`);
  console.log(`Status: ${session.dir}\\status.json`);
  console.log(`Machine log: ${session.dir}\\events.ndjson`);
}
