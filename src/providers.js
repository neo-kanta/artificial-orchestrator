import { runCli, runProcess } from "./process.js";
import { parseClaudeJson, parseCodexJsonl, parseLimit } from "./parsers.js";

export async function callProvider(provider, prompt) {
  if (provider.kind === "openai") return callOpenAI(prompt, provider);
  if (provider.kind === "codex") return callCodex(prompt, provider);
  if (provider.kind === "claude") return callClaude(prompt, provider);
  return callCommandProvider(prompt, provider);
}

export async function callOpenAI(prompt, options) {
  const startedAt = Date.now();
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      provider: "openai",
      ok: false,
      code: 1,
      text: "OPENAI_API_KEY is not set.",
      usage: null,
      costUsd: null,
      raw: null,
      limit: null,
      errors: ["missing OPENAI_API_KEY"],
      stderr: "",
      durationMs: Date.now() - startedAt
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10 * 60 * 1000);

  try {
    const response = await (options.fetch ?? globalThis.fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(openAIRequestBody(prompt, options)),
      signal: controller.signal
    });

    const rawText = await response.text();
    const raw = parseJson(rawText);
    const parsed = parseOpenAIResponse(raw ?? rawText, options.responseFormat);
    const limit = response.status === 429 ? openAILimit(raw ?? rawText) : null;
    const error = openAIError(raw ?? rawText);

    return {
      provider: "openai",
      ok: response.ok && !limit && !error && Boolean(parsed.text),
      code: response.status,
      text: limit ? limit.message : error ?? parsed.text,
      usage: parsed.usage,
      costUsd: null,
      raw,
      limit,
      errors: [...parsed.errors, ...(error ? [error] : [])],
      stderr: response.ok ? "" : rawText,
      durationMs: Date.now() - startedAt,
      structured: parsed.structured
    };
  } catch (error) {
    const message = error.name === "AbortError" ? "OpenAI request timed out." : error.message;
    return {
      provider: "openai",
      ok: false,
      code: error.name === "AbortError" ? 124 : 1,
      text: message,
      usage: null,
      costUsd: null,
      raw: null,
      limit: null,
      errors: [message],
      stderr: "",
      durationMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timeout);
  }
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

function openAIRequestBody(prompt, options) {
  const body = {
    model: options.model ?? "gpt-5.5",
    input: prompt,
    max_output_tokens: Number(options.maxOutputTokens ?? 4096)
  };

  if (options.reasoning && options.reasoning !== "none") {
    body.reasoning = { effort: options.reasoning };
  }

  if ((options.responseFormat ?? "text") === "json") {
    body.text = {
      format: {
        type: "json_schema",
        name: "artificial_orchestrator_provider_result",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "handoff", "status", "blockers", "filesSuggested", "testsSuggested"],
          properties: {
            summary: { type: "string" },
            handoff: { type: "string" },
            status: { type: "string", enum: ["continue", "done", "blocked"] },
            blockers: { type: "array", items: { type: "string" } },
            filesSuggested: { type: "array", items: { type: "string" } },
            testsSuggested: { type: "array", items: { type: "string" } }
          }
        }
      }
    };
  }

  return body;
}

export function parseOpenAIResponse(raw, responseFormat = "text") {
  const usage = raw?.usage
    ? {
        input_tokens: raw.usage.input_tokens,
        output_tokens: raw.usage.output_tokens,
        total_tokens: raw.usage.total_tokens
      }
    : null;
  const text = extractOpenAIText(raw);

  if (responseFormat !== "json") {
    return { text, usage, structured: null, errors: [] };
  }

  const structured = parseJson(text);
  if (!structured) {
    return {
      text,
      usage,
      structured: null,
      errors: text ? ["OpenAI response was not valid JSON; using text fallback."] : ["OpenAI response did not include output text."]
    };
  }

  return {
    text: formatStructuredOpenAIResult(structured),
    usage,
    structured,
    errors: []
  };
}

function extractOpenAIText(raw) {
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw.output_text === "string") return raw.output_text.trim();

  const parts = [];
  for (const item of raw.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") parts.push(content.text);
      if (typeof content.value === "string") parts.push(content.value);
    }
  }

  return parts.join("\n").trim();
}

function formatStructuredOpenAIResult(result) {
  const blockers = Array.isArray(result.blockers) && result.blockers.length ? result.blockers.join("; ") : "none";
  const files = Array.isArray(result.filesSuggested) && result.filesSuggested.length ? result.filesSuggested.join(", ") : "none";
  const tests = Array.isArray(result.testsSuggested) && result.testsSuggested.length ? result.testsSuggested.join("; ") : "none";

  return [
    result.summary || "(no summary)",
    "",
    `Handoff: ${result.handoff || "(none)"}`,
    `Status: ${result.status || "continue"}`,
    `Blockers: ${blockers}`,
    `Files suggested: ${files}`,
    `Tests suggested: ${tests}`
  ].join("\n");
}

function openAILimit(raw) {
  const message = openAIError(raw) ?? "OpenAI rate limit hit.";
  return {
    kind: "rate_limit",
    reset: "unknown",
    message
  };
}

function openAIError(raw) {
  if (typeof raw === "string") return raw.trim() || null;
  return raw?.error?.message ?? null;
}

function parseJson(text) {
  if (typeof text !== "string") return text && typeof text === "object" ? text : null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
