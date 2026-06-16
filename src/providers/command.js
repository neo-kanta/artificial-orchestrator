import { runProcess } from "../platform/process.js";
import { parseLimit } from "./parsers.js";

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
    structured: structuredOutput(parsed.raw),
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

function structuredOutput(raw) {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
}
