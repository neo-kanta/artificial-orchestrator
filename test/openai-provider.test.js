import test from "node:test";
import assert from "node:assert/strict";
import { callOpenAI, parseOpenAIResponse } from "../src/providers.js";

test("OpenAI provider reports missing API key without calling fetch", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const result = await callOpenAI("hello", {
      model: "gpt-test",
      fetch: () => {
        throw new Error("fetch should not be called");
      }
    });

    assert.equal(result.ok, false);
    assert.match(result.text, /OPENAI_API_KEY/);
    assert.deepEqual(result.errors, ["missing OPENAI_API_KEY"]);
  } finally {
    restoreEnv("OPENAI_API_KEY", oldKey);
  }
});

test("OpenAI provider builds Responses API requests and parses structured output", async () => {
  const result = await callOpenAI("ship it", {
    apiKey: "test-key",
    model: "gpt-test",
    reasoning: "low",
    maxOutputTokens: 123,
    responseFormat: "json",
    fetch: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.authorization, "Bearer test-key");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "gpt-test");
      assert.equal(body.input, "ship it");
      assert.deepEqual(body.reasoning, { effort: "low" });
      assert.equal(body.max_output_tokens, 123);
      assert.equal(body.text.format.type, "json_schema");

      return response(200, {
        output_text: JSON.stringify({
          summary: "Reviewed the plan.",
          handoff: "Builder can continue.",
          status: "continue",
          blockers: [],
          filesSuggested: ["src/example.js"],
          testsSuggested: ["npm test"]
        }),
        usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 }
      });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.structured.status, "continue");
  assert.match(result.text, /Reviewed the plan/);
  assert.deepEqual(result.usage, { input_tokens: 1, output_tokens: 2, total_tokens: 3 });
});

test("OpenAI parser falls back to text when JSON is malformed", () => {
  const parsed = parseOpenAIResponse({ output_text: "not json", usage: { input_tokens: 1 } }, "json");
  assert.equal(parsed.text, "not json");
  assert.equal(parsed.structured, null);
  assert.match(parsed.errors[0], /not valid JSON/);
});

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
