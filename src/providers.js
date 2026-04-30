import { runCli, runProcess } from "./process.js";
import { parseClaudeJson, parseCodexJsonl, parseLimit } from "./parsers.js";

export async function callProvider(provider, prompt) {
  if (provider.kind === "codex") return callCodex(prompt, provider);
  if (provider.kind === "claude") return callClaude(prompt, provider);
  return callCommandProvider(prompt, provider);
}

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

export async function callCommandProvider(prompt, provider) {
  if (!provider.command) throw new Error(`Provider "${provider.id}" is missing a command.`);

  const vars = {
    prompt,
    workspace: provider.workspace,
    goal: provider.goal ?? "",
    id: provider.id,
    role: provider.role ?? "reviewer"
  };

  const args = (provider.args ?? []).map((arg) => renderTemplate(String(arg), vars));
  const usesPromptTemplate = args.some((arg) => arg.includes(prompt));
  const promptMode = provider.promptMode ?? (usesPromptTemplate ? "arg-template" : "stdin");

  if (promptMode === "arg") args.push(prompt);

  const result = await runProcess(provider.command, args, {
    cwd: provider.cwd ?? provider.workspace,
    timeoutMs: provider.timeoutMs,
    env: renderEnv(provider.env, vars),
    input: promptMode === "stdin" ? prompt : undefined
  });

  const parsed = parseGenericOutput(result.stdout, provider.parser);
  const limit = parseLimit(`${result.stdout}\n${result.stderr}`);

  return {
    provider: provider.id,
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

export function renderTemplate(value, vars) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match;
  });
}

function parseGenericOutput(stdout, parser = "text") {
  const text = stdout.trim();
  if (parser !== "json" || !text.startsWith("{")) {
    return { text, usage: null, costUsd: null, raw: null };
  }

  try {
    const raw = JSON.parse(text);
    return {
      text: raw.text ?? raw.result ?? raw.response ?? JSON.stringify(raw, null, 2),
      usage: raw.usage ?? null,
      costUsd: raw.costUsd ?? raw.cost_usd ?? raw.total_cost_usd ?? null,
      raw
    };
  } catch {
    return { text, usage: null, costUsd: null, raw: null };
  }
}

function renderEnv(env = {}, vars) {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, renderTemplate(String(value), vars)])
  );
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
