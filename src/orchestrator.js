import { appendTurn, createSession } from "./logger.js";
import { callClaude, callCodex } from "./providers.js";
import { usageLine } from "./parsers.js";
import { claudeArchitectPrompt, codexBuilderPrompt } from "./prompts.js";
import { workspaceSnapshot } from "./snapshot.js";
import { color } from "./ansi.js";

export async function runDuet(options) {
  const session = await createSession(options.workspace, options.goal);
  const history = [];

  console.log(color("bold", "Artificial Orchestrator"));
  console.log(`session: ${session.dir}`);
  console.log(`workspace: ${options.workspace}`);
  console.log(`mode: ${options.apply ? "apply" : "plan"}\n`);

  for (let round = 1; round <= options.rounds; round += 1) {
    const snapshot = await workspaceSnapshot(options.workspace);
    const recent = compactHistory(history, options.historyChars);

    if (!options.codexOnly) {
      await runProviderTurn({
        session,
        round,
        provider: "claude",
        fn: () =>
          callClaude(
            claudeArchitectPrompt({
              goal: options.goal,
              round,
              workspaceSnapshot: snapshot,
              history: recent
            }),
            options.claude
          ),
        history
      });
    }

    if (!options.claudeOnly) {
      await runProviderTurn({
        session,
        round,
        provider: "codex",
        fn: () =>
          callCodex(
            codexBuilderPrompt({
              goal: options.goal,
              round,
              workspaceSnapshot: snapshot,
              history: compactHistory(history, options.historyChars),
              apply: options.apply
            }),
            options.codex
          ),
        history
      });
    }

    if (history.some((entry) => entry.round === round && /DUET_STATUS:\s*done/i.test(entry.text))) {
      console.log(color("green", "\nDUET_STATUS: done"));
      break;
    }
  }

  console.log(`\nTranscript: ${session.dir}\\transcript.md`);
  console.log(`Machine log: ${session.dir}\\events.ndjson`);
  return session;
}

async function runProviderTurn({ session, round, provider, fn, history }) {
  process.stdout.write(color("cyan", `[round ${round}] ${provider} thinking... `));
  const result = await fn();
  const line = usageLine(result.usage);
  const status = result.ok ? color("green", "ok") : color("yellow", "blocked");
  console.log(`${status} (${Math.round(result.durationMs / 1000)}s, ${line})`);

  if (result.limit) {
    console.log(color("yellow", `${provider} limit reset: ${result.limit.reset}`));
  }

  const text = result.text || "(no output)";
  console.log(color(provider === "claude" ? "magenta" : "blue", `\n${provider.toUpperCase()}`));
  console.log(text);
  console.log("");

  const turn = {
    round,
    provider,
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
  history.push({ round, provider, text });
}

function compactHistory(history, maxChars) {
  const text = history
    .slice(-6)
    .map((entry) => `Round ${entry.round} ${entry.provider}:\n${entry.text}`)
    .join("\n\n");

  if (text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
}
