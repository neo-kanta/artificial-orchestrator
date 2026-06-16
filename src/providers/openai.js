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
