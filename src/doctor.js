import { runCli } from "./process.js";
import { mark } from "./ansi.js";
import { parseClaudeJson, parseCodexJsonl, parseLimit, usageLine } from "./parsers.js";

export async function doctor(options) {
  const checks = [];

  checks.push(await commandCheck("git", ["--version"]));
  checks.push(await commandCheck("node", ["--version"]));
  checks.push(await commandCheck("codex", ["--version"]));
  checks.push(await commandCheck("claude", ["--version"]));
  checks.push(await commandCheck("gh", ["--version"]));

  const ghAuth = await runCli("gh", ["auth", "status"], { timeoutMs: 15000 });
  checks.push({
    name: "gh auth",
    ok: ghAuth.ok,
    warn: !ghAuth.ok,
    detail: ghAuth.ok ? "authenticated" : "not authenticated; run gh auth login"
  });

  if (options.ping) {
    checks.push(await codexPing(options));
    checks.push(await claudePing(options));
  }

  for (const check of checks) {
    const status = check.ok ? "ok" : check.warn ? "warn" : "fail";
    console.log(`${mark(status)}  ${check.name} - ${check.detail}`);
  }

  return checks.every((check) => check.ok || check.warn);
}

async function commandCheck(name, args) {
  const result = await runCli(name, args, { timeoutMs: 10000 });
  return {
    name,
    ok: result.ok,
    detail: result.ok ? firstLine(result.stdout || result.stderr) : firstLine(result.stderr || result.stdout)
  };
}

async function codexPing(options) {
  const result = await runCli(
    "codex",
    [
      "exec",
      "--ephemeral",
      "--json",
      "--color",
      "never",
      "--skip-git-repo-check",
      "-m",
      options.codexModel,
      "--sandbox",
      "read-only",
      "Reply with exactly: codex ok"
    ],
    { cwd: options.workspace, timeoutMs: 120000, env: { CODEX_DISABLE_PLUGIN_SYNC: "1" } }
  );
  const parsed = parseCodexJsonl(result.stdout);
  return {
    name: "codex ping",
    ok: result.ok && /codex ok/i.test(parsed.text),
    detail: parsed.errors[0] ?? parsed.text ?? usageLine(parsed.usage)
  };
}

async function claudePing(options) {
  const result = await runCli(
    "claude",
    [
      "-p",
      "Reply with exactly: claude ok",
      "--output-format",
      "json",
      "--tools",
      "",
      "--no-session-persistence",
      "--max-budget-usd",
      String(options.maxBudgetUsd)
    ],
    { cwd: options.workspace, timeoutMs: 120000 }
  );
  const limit = parseLimit(`${result.stdout}\n${result.stderr}`);
  if (limit) {
    return {
      name: "claude ping",
      ok: false,
      warn: true,
      detail: `usage limit hit; resets ${limit.reset}`
    };
  }

  const parsed = parseClaudeJson(result.stdout);
  return {
    name: "claude ping",
    ok: result.ok && /claude ok/i.test(parsed.text),
    detail: parsed.text || firstLine(result.stderr)
  };
}

function firstLine(text) {
  return (text || "").trim().split(/\r?\n/)[0] || "unavailable";
}
