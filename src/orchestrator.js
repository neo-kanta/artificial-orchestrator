import { appendTurn, createSession, finalizeSession, readOrgContext, readProviderContext } from "./logger.js";
import { callProvider } from "./providers.js";
import { usageLine } from "./parsers.js";
import { providerPrompt } from "./prompts.js";
import { workspaceSnapshot } from "./snapshot.js";
import { color } from "./ansi.js";

export async function runDuet(options) {
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
        fn: () =>
          call(
            provider,
            providerPrompt({
              provider,
              goal: options.goal,
              round,
              workspaceSnapshot: snapshot,
              history: compactHistory(history, options.historyChars),
              durableState,
              apply: options.apply
            })
          ),
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

async function runProviderTurn({ session, round, provider, fn, history }) {
  process.stdout.write(color("cyan", `[round ${round}] ${provider.id} thinking... `));
  const result = await fn();
  const line = usageLine(result.usage);
  const status = result.ok ? color("green", "ok") : color("yellow", "blocked");
  console.log(`${status} (${Math.round(result.durationMs / 1000)}s, ${line})`);

  if (result.limit) {
    console.log(color("yellow", `${provider.id} limit reset: ${result.limit.reset}`));
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
    usage: result.usage ?? null,
    usageLine: line,
    costUsd: result.costUsd ?? null,
    limit: result.limit ?? null,
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
  const value = result.structured?.status;
  if (value === "done" || value === "blocked" || value === "continue") return value;

  const match = String(result.text ?? "").match(/\bStatus:\s*(done|blocked|continue)\b/i);
  if (match) return match[1].toLowerCase();
  return result.ok ? "continue" : "blocked";
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

  const status = reportedStatus(turn.text);
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

function reportedStatus(text) {
  const match = String(text ?? "").match(/\b(?:DUET_STATUS|ORCHESTRATOR_STATUS|Status):\s*(done|blocked|continue)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function terminalBlockers(turn) {
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

function compactText(text, maxChars) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 80)).trim()}\n\n[truncated: ${normalized.length - maxChars} chars omitted]`;
}
