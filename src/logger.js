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

  await writeJson(join(dir, "status.json"), state);
  await writeJson(join(dir, "provider-state.json"), providerState);
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

  return { dir, state, providerState };
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
