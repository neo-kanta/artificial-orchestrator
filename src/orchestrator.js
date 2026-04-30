import { appendTurn, createSession } from "./logger.js";
import { callProvider } from "./providers.js";
import { usageLine } from "./parsers.js";
import { providerPrompt } from "./prompts.js";
import { workspaceSnapshot } from "./snapshot.js";
import { color } from "./ansi.js";

export async function runDuet(options) {
  const session = await createSession(options.workspace, options.goal);
  const history = [];

  console.log(color("bold", "Artificial Orchestrator"));
  console.log(`session: ${session.dir}`);
  console.log(`workspace: ${options.workspace}`);
  console.log(`mode: ${options.apply ? "apply" : "plan"}\n`);
  console.log(`pipeline: ${options.providers.map((provider) => provider.id).join(" -> ")}\n`);

  for (let round = 1; round <= options.rounds; round += 1) {
    const snapshot = await workspaceSnapshot(options.workspace);
    const recent = compactHistory(history, options.historyChars);

    for (const provider of options.providers) {
      await runProviderTurn({
        session,
        round,
        provider,
        fn: () =>
          callProvider(
            provider,
            providerPrompt({
              provider,
              goal: options.goal,
              round,
              workspaceSnapshot: snapshot,
              history: compactHistory(history, options.historyChars),
              apply: options.apply
            })
          ),
        history
      });
    }

    if (history.some((entry) => entry.round === round && /(DUET_STATUS|ORCHESTRATOR_STATUS):\s*done/i.test(entry.text))) {
      console.log(color("green", "\nORCHESTRATOR_STATUS: done"));
      break;
    }
  }

  console.log(`\nTranscript: ${session.dir}\\transcript.md`);
  console.log(`Machine log: ${session.dir}\\events.ndjson`);
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
}

function compactHistory(history, maxChars) {
  const text = history
    .slice(-6)
    .map((entry) => `Round ${entry.round} ${entry.provider}:\n${entry.text}`)
    .join("\n\n");

  if (text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
}
