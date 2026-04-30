import test from "node:test";
import assert from "node:assert/strict";
import { parseClaudeJson, parseCodexJsonl, parseLimit, usageLine } from "../src/parsers.js";

test("parses Codex JSONL messages and usage", () => {
  const parsed = parseCodexJsonl(
    [
      '{"type":"thread.started","thread_id":"abc"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"hello"}}',
      '{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":2,"output_tokens":3}}'
    ].join("\n")
  );

  assert.equal(parsed.threadId, "abc");
  assert.equal(parsed.text, "hello");
  assert.deepEqual(parsed.usage, {
    input_tokens: 10,
    cached_input_tokens: 2,
    output_tokens: 3
  });
  assert.equal(usageLine(parsed.usage), "tokens: in 10, cached 2, out 3");
});

test("parses Claude JSON result", () => {
  const parsed = parseClaudeJson(
    JSON.stringify({
      result: "claude ok",
      usage: { input_tokens: 1, output_tokens: 2 },
      total_cost_usd: 0.01
    })
  );

  assert.equal(parsed.text, "claude ok");
  assert.equal(parsed.costUsd, 0.01);
  assert.deepEqual(parsed.usage, { input_tokens: 1, output_tokens: 2 });
});

test("parses Claude limit reset text", () => {
  const limit = parseLimit("You've hit your limit · resets 1:20pm (Asia/Bangkok)");
  assert.equal(limit.kind, "rate_limit");
  assert.equal(limit.reset, "1:20pm (Asia/Bangkok)");
});
