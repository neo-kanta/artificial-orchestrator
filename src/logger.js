import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

export async function createSession(root, goal, metadata = {}) {
  const safe = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(root, ".duet", "sessions", safe);
  await mkdir(dir, { recursive: true });

  const now = new Date().toISOString();
  const state = {
    id: safe,
    goal,
    project: metadata.project ?? null,
    org: metadata.org ? { id: metadata.org.id, label: metadata.org.label ?? metadata.org.id } : null,
    startedAt: now,
    updatedAt: now,
    providers: {},
    rounds: []
  };

  const providerState = {
    id: safe,
    goal,
    project: metadata.project ?? null,
    startedAt: now,
    updatedAt: now,
    providers: {},
    handoffs: []
  };

  const orgState = metadata.org
    ? {
        id: safe,
        goal,
        org: {
          id: metadata.org.id,
          label: metadata.org.label ?? metadata.org.id,
          pipeline: metadata.org.pipeline ?? []
        },
        project: metadata.project ?? null,
        startedAt: now,
        updatedAt: now,
        phase: "running",
        roles: {},
        blockers: [],
        finalDecision: null
      }
    : null;

  await writeJson(join(dir, "status.json"), state);
  await writeJson(join(dir, "provider-state.json"), providerState);
  if (orgState) await writeJson(join(dir, "org-state.json"), orgState);
  await appendFile(
    join(dir, "transcript.md"),
    `# Artificial Orchestrator Session\n\nGoal: ${goal}\n\n${formatProject(metadata.project)}\n`
  );
  await writeFile(
    join(dir, "handoff.md"),
    `# Provider Handoff\n\nGoal: ${goal}\n\n${formatProject(metadata.project)}\nNo provider handoffs yet.\n`,
    "utf8"
  );
  await writeFile(join(root, ".duet", "latest"), dir, "utf8");

  return { dir, state, providerState, orgState };
}

export async function appendTurn(session, turn) {
  const event = { ...turn, at: new Date().toISOString() };
  await appendFile(join(session.dir, "events.ndjson"), `${JSON.stringify(event)}\n`);

  const title = `## Round ${turn.round} - ${turn.provider}`;
  const meta = [
    `status: ${turn.ok ? "ok" : "failed"}`,
    turn.usageLine,
    turn.limit ? `limit reset: ${turn.limit.reset}` : null,
    `duration: ${Math.round(turn.durationMs / 1000)}s`
  ]
    .filter(Boolean)
    .join(" | ");

  await appendFile(
    join(session.dir, "transcript.md"),
    `${title}\n\n${meta}\n\n${turn.text || "(no output)"}\n\n`
  );

  session.state.updatedAt = event.at;
  session.state.providers[turn.provider] = {
    ok: turn.ok,
    limit: turn.limit ?? null,
    usage: turn.usage ?? null,
    costUsd: turn.costUsd ?? null,
    lastDurationMs: turn.durationMs
  };
  session.state.rounds.push({
    round: turn.round,
    provider: turn.provider,
    ok: turn.ok,
    limit: turn.limit ?? null
  });

  await writeJson(join(session.dir, "status.json"), session.state);

  const handoff = formatTurnHandoff(turn, event.at);
  await appendFile(join(session.dir, "handoff.md"), `${handoff}\n`, "utf8");

  session.providerState.updatedAt = event.at;
  session.providerState.providers[turn.provider] = {
    ok: turn.ok,
    lastRound: turn.round,
    lastAt: event.at,
    limit: turn.limit ?? null,
    usage: turn.usage ?? null,
    costUsd: turn.costUsd ?? null,
    lastDurationMs: turn.durationMs,
    handoff: compactText(turn.text, 1600)
  };
  session.providerState.handoffs.push({
    round: turn.round,
    provider: turn.provider,
    ok: turn.ok,
    at: event.at,
    handoff: compactText(turn.text, 1600)
  });

  await writeJson(join(session.dir, "provider-state.json"), session.providerState);

  if (session.orgState && turn.role) {
    session.orgState.updatedAt = event.at;
    session.orgState.roles[turn.role] = {
      provider: turn.provider,
      ok: turn.ok,
      status: turn.orgStatus ?? (turn.ok ? "continue" : "blocked"),
      lastRound: turn.round,
      lastAt: event.at,
      summary: compactText(turn.text, 800),
      blockers: turn.blockers ?? []
    };

    if (turn.orgStatus === "blocked") {
      session.orgState.phase = "blocked";
      session.orgState.blockers.push({
        role: turn.role,
        provider: turn.provider,
        at: event.at,
        blockers: turn.blockers ?? [compactText(turn.text, 400)]
      });
    }

    if (turn.orgStatus === "done") {
      session.orgState.phase = "done";
      session.orgState.finalDecision = {
        role: turn.role,
        provider: turn.provider,
        at: event.at,
        summary: compactText(turn.text, 800)
      };
    }

    await writeJson(join(session.dir, "org-state.json"), session.orgState);
  }
}

export async function readLatest(root) {
  const file = join(root, ".duet", "latest");
  const value = await readFile(file, "utf8");
  return value.trim();
}

export async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readProviderContext(session, maxChars = 8000) {
  const [handoff, providerState] = await Promise.all([
    readFile(join(session.dir, "handoff.md"), "utf8"),
    readFile(join(session.dir, "provider-state.json"), "utf8")
  ]);

  return {
    handoff: compactText(handoff.trim(), maxChars),
    providerState: compactText(providerState.trim(), maxChars)
  };
}

export async function readOrgContext(session, maxChars = 8000) {
  if (!session.orgState) return null;

  try {
    const orgState = await readFile(join(session.dir, "org-state.json"), "utf8");
    return compactText(orgState.trim(), maxChars);
  } catch {
    return null;
  }
}

function formatProject(project) {
  if (!project) return "";
  return [`Project: ${project.name}`, `Path: ${project.path}`, ""].join("\n");
}

function formatTurnHandoff(turn, at) {
  const meta = [
    `status: ${turn.ok ? "ok" : "blocked"}`,
    turn.usageLine,
    turn.limit ? `limit reset: ${turn.limit.reset}` : null,
    `duration: ${Math.round(turn.durationMs / 1000)}s`
  ]
    .filter(Boolean)
    .join(" | ");

  return [`## Round ${turn.round} - ${turn.provider}`, "", `at: ${at}`, meta, "", compactText(turn.text || "(no output)", 1600), ""].join("\n");
}

function compactText(text, maxChars) {
  const normalized = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 80)).trim()}\n\n[truncated: ${normalized.length - maxChars} chars omitted]`;
}
