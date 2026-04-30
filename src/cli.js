import { resolve } from "node:path";
import { parseArgs } from "./args.js";
import { doctor } from "./doctor.js";
import { runDuet } from "./orchestrator.js";
import { publishPrivate } from "./publish.js";
import { tailLatest } from "./tail.js";

const DEFAULT_CODEX_MODEL = "gpt-5.4-mini";

export async function main(argv) {
  const args = parseArgs(argv);
  const command = args._[0] ?? "help";

  if (command === "help" || args.help || args.h) {
    help();
    return;
  }

  const workspace = resolve(String(args.workspace ?? args.w ?? process.cwd()));

  if (command === "doctor") {
    const ok = await doctor({
      workspace,
      ping: Boolean(args.ping),
      codexModel: String(args.codexModel ?? DEFAULT_CODEX_MODEL),
      maxBudgetUsd: args.maxBudgetUsd ?? 0.01
    });
    process.exitCode = ok ? 0 : 1;
    return;
  }

  if (command === "run") {
    const goal = String(args.goal ?? args.g ?? args._.slice(1).join(" ")).trim();
    if (!goal) throw new Error("Missing goal. Example: ao run --goal \"finish the market data tests\"");

    await runDuet({
      goal,
      workspace,
      rounds: Number(args.rounds ?? args.r ?? 2),
      apply: Boolean(args.apply),
      historyChars: Number(args.historyChars ?? 12000),
      codexOnly: Boolean(args.codexOnly),
      claudeOnly: Boolean(args.claudeOnly),
      codex: {
        workspace,
        model: String(args.codexModel ?? DEFAULT_CODEX_MODEL),
        apply: Boolean(args.apply),
        unsafe: Boolean(args.unsafe),
        timeoutMs: Number(args.timeoutMs ?? 15 * 60 * 1000)
      },
      claude: {
        workspace,
        model: args.claudeModel ? String(args.claudeModel) : undefined,
        maxBudgetUsd: args.maxBudgetUsd ?? undefined,
        allowTools: Boolean(args.claudeTools),
        timeoutMs: Number(args.timeoutMs ?? 15 * 60 * 1000)
      }
    });
    return;
  }

  if (command === "publish") {
    await publishPrivate({
      workspace,
      repo: args.repo ? String(args.repo) : undefined
    });
    return;
  }

  if (command === "tail") {
    await tailLatest(workspace);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function help() {
  console.log(`Artificial Orchestrator

Usage:
  ao doctor [--ping] [--workspace <path>]
  ao run --goal "<mission>" [--workspace <path>] [--rounds 2] [--apply]
  ao tail [--workspace <path>]
  ao publish --repo <private-repo-name>

Commands:
  doctor   Check local codex, claude, git, gh, and optional API pings.
  run      Let Claude review/architect and Codex build/execute in rounds.
  tail     Print the latest transcript for a workspace.
  publish  Create/push a private GitHub repo using gh auth.

Key options:
  --apply                 Allow Codex to edit the workspace. Without this, it plans only.
  --unsafe                Let Codex bypass approvals and sandbox. Use only in trusted worktrees.
  --codex-model <model>   Default: ${DEFAULT_CODEX_MODEL}
  --claude-model <model>  Optional Claude model alias/name.
  --max-budget-usd <n>    Passed to Claude CLI when supported.
  --claude-tools          Allow Claude tools. Default keeps Claude as no-tools architect/reviewer.

Notes:
  The transcript shows public reasoning, decisions, outputs, and status. It does not expose private hidden chain-of-thought.
  Session files are stored under <workspace>/.duet/sessions/.
`);
}
