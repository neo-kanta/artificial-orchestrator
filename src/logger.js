import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

export async function createSession(root, goal) {
  const safe = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(root, ".duet", "sessions", safe);
  await mkdir(dir, { recursive: true });

  const state = {
    id: safe,
    goal,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    providers: {},
    rounds: []
  };

  await writeJson(join(dir, "status.json"), state);
  await appendFile(join(dir, "transcript.md"), `# Architect Duet Session\n\nGoal: ${goal}\n\n`);
  await writeFile(join(root, ".duet", "latest"), dir, "utf8");

  return { dir, state };
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
}

export async function readLatest(root) {
  const file = join(root, ".duet", "latest");
  const value = await readFile(file, "utf8");
  return value.trim();
}

export async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
