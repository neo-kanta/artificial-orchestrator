import { runCli } from "../platform/process.js";
import { parseClaudeJson, parseLimit } from "./parsers.js";

export async function callClaude(prompt, options) {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--no-session-persistence"
  ];

  if (options.model) args.push("--model", options.model);
  if (options.maxBudgetUsd) args.push("--max-budget-usd", String(options.maxBudgetUsd));

  if (options.allowTools) {
    args.push("--permission-mode", options.permissionMode ?? "dontAsk");
  } else {
    args.push("--tools", "");
  }

  const result = await runCli("claude", args, {
    cwd: options.workspace,
    timeoutMs: options.timeoutMs
  });

  const parsed = parseClaudeJson(result.stdout);
  const limit = parseLimit(`${result.stdout}\n${result.stderr}`);

  return {
    provider: "claude",
    ok: result.ok && !limit,
    code: result.code,
    text: limit ? limit.message : parsed.text || result.stderr.trim(),
    usage: parsed.usage,
    costUsd: parsed.costUsd,
    raw: parsed.raw,
    limit,
    stderr: result.stderr.trim(),
    durationMs: result.durationMs
  };
}
