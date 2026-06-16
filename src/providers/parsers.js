export function parseCodexJsonl(stdout) {
  const events = [];
  const messages = [];
  const errors = [];
  let usage = null;
  let threadId = null;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;

    try {
      const event = JSON.parse(trimmed);
      events.push(event);

      if (event.type === "thread.started") threadId = event.thread_id;
      if (event.type === "turn.completed") usage = event.usage ?? usage;
      if (event.type === "error") errors.push(event.message ?? JSON.stringify(event));
      if (event.type === "turn.failed") {
        errors.push(event.error?.message ?? JSON.stringify(event.error ?? event));
      }
      if (event.type === "item.completed" && event.item?.type === "agent_message") {
        messages.push(event.item.text ?? "");
      }
    } catch {
      // Ignore non-Codex JSON fragments.
    }
  }

  return {
    text: messages.join("\n\n").trim(),
    usage,
    threadId,
    events,
    errors
  };
}

export function parseClaudeJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{")) {
    return { text: trimmed, usage: null, raw: null };
  }

  try {
    const raw = JSON.parse(trimmed);
    return {
      text: extractClaudeText(raw).trim(),
      usage: raw.usage ?? raw.message?.usage ?? null,
      costUsd: raw.total_cost_usd ?? raw.cost_usd ?? null,
      raw
    };
  } catch {
    return { text: trimmed, usage: null, raw: null };
  }
}

export function parseLimit(stderrOrStdout) {
  const text = stderrOrStdout || "";
  const match = text.match(/hit your limit.*?resets\s+(.+?)(?:\r?\n|$)/i);
  if (!match) return null;
  return {
    kind: "rate_limit",
    reset: match[1].trim(),
    message: text.trim()
  };
}

export function usageLine(usage) {
  if (!usage) return "usage: unavailable";

  const input = usage.input_tokens ?? usage.input ?? usage.prompt_tokens;
  const cached = usage.cached_input_tokens ?? usage.cache_read_input_tokens;
  const output = usage.output_tokens ?? usage.output ?? usage.completion_tokens;
  const parts = [];

  if (input !== undefined) parts.push(`in ${input}`);
  if (cached !== undefined) parts.push(`cached ${cached}`);
  if (output !== undefined) parts.push(`out ${output}`);

  return parts.length ? `tokens: ${parts.join(", ")}` : `usage: ${JSON.stringify(usage)}`;
}

function extractClaudeText(raw) {
  if (typeof raw.result === "string") return raw.result;
  if (typeof raw.response === "string") return raw.response;
  if (typeof raw.text === "string") return raw.text;

  const content = raw.message?.content ?? raw.content;
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return JSON.stringify(raw, null, 2);
}
