import { runCli } from "./process.js";
import { parseClaudeJson, parseCodexJsonl, parseLimit } from "./parsers.js";

export async function callCodex(prompt, options) {
  const args = [
    "exec",
    "--ephemeral",
    "--json",
    "--color",
    "never",
    "--skip-git-repo-check",
    "-m",
    options.model,
    "-C",
    options.workspace
  ];

  if (options.unsafe) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else if (options.apply) {
    args.push("--full-auto", "--sandbox", "workspace-write");
  } else {
    args.push("--sandbox", "read-only");
  }

  args.push(prompt);

  const result = await runCli("codex", args, {
    cwd: options.workspace,
    timeoutMs: options.timeoutMs,
    env: {
      CODEX_DISABLE_PLUGIN_SYNC: "1"
    }
  });

  const parsed = parseCodexJsonl(result.stdout);
  const limit = result.ok ? null : parseLimit(`${parsed.errors.join("\n")}\n${result.stderr}`);

  return {
    provider: "codex",
    ok: result.ok && parsed.errors.length === 0,
    code: result.code,
    text: parsed.text || result.stdout.trim() || result.stderr.trim(),
    usage: parsed.usage,
    threadId: parsed.threadId,
    events: parsed.events,
    errors: parsed.errors,
    limit,
    stderr: scrubNoise(result.stderr),
    durationMs: result.durationMs
  };
}

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

function scrubNoise(stderr) {
  return stderr
    .split(/\r?\n/)
    .filter((line) => !line.includes("cdn-cgi/challenge-platform"))
    .filter((line) => !line.includes("<svg"))
    .filter((line) => !line.includes("<html>"))
    .join("\n")
    .trim();
}
