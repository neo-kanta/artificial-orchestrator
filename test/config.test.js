import test from "node:test";
import assert from "node:assert/strict";
import { resolveProviders, splitList } from "../src/config.js";
import { renderTemplate } from "../src/providers.js";

test("splits provider lists", () => {
  assert.deepEqual(splitList("claude,codex, ollama "), ["claude", "codex", "ollama"]);
});

test("resolves built-in and configured providers", () => {
  const providers = resolveProviders({
    config: {
      pipeline: ["local-reviewer", "codex"],
      providers: {
        "local-reviewer": {
          id: "local-reviewer",
          label: "Local Reviewer",
          kind: "command",
          role: "reviewer",
          command: "node"
        }
      }
    },
    runtime: {
      workspace: "C:/repo",
      goal: "ship the provider slice",
      timeoutMs: 1000,
      codexModel: "gpt-test",
      apply: false,
      unsafe: false
    }
  });

  assert.equal(providers[0].id, "local-reviewer");
  assert.equal(providers[0].workspace, "C:/repo");
  assert.equal(providers[0].goal, "ship the provider slice");
  assert.equal(providers[1].id, "codex");
  assert.equal(providers[1].model, "gpt-test");
});

test("resolves built-in OpenAI provider defaults and runtime overrides", () => {
  const [provider] = resolveProviders({
    config: {},
    providerList: "openai",
    runtime: {
      workspace: "C:/repo",
      timeoutMs: 1000,
      openaiModel: "gpt-openai-test",
      openaiReasoning: "high",
      openaiMaxOutputTokens: 512
    }
  });

  assert.equal(provider.kind, "openai");
  assert.equal(provider.model, "gpt-openai-test");
  assert.equal(provider.reasoning, "high");
  assert.equal(provider.maxOutputTokens, 512);
  assert.equal(provider.responseFormat, "json");
});

test("configured OpenAI providers keep explicit options", () => {
  const [provider] = resolveProviders({
    config: {
      providers: {
        planner: {
          id: "planner",
          kind: "openai",
          model: "gpt-planner",
          reasoning: "low",
          maxOutputTokens: 99,
          responseFormat: "text"
        }
      }
    },
    providerList: "planner",
    runtime: {
      workspace: "C:/repo",
      timeoutMs: 1000
    }
  });

  assert.equal(provider.id, "planner");
  assert.equal(provider.model, "gpt-planner");
  assert.equal(provider.reasoning, "low");
  assert.equal(provider.maxOutputTokens, 99);
  assert.equal(provider.responseFormat, "text");
});

test("explicit runtime OpenAI model overrides configured providers", () => {
  const [provider] = resolveProviders({
    config: {
      providers: {
        planner: {
          id: "planner",
          kind: "openai",
          model: "gpt-planner",
          reasoning: "low"
        }
      }
    },
    providerList: "planner",
    runtime: {
      workspace: "C:/repo",
      timeoutMs: 1000,
      openaiModel: "gpt-runtime"
    }
  });

  assert.equal(provider.model, "gpt-runtime");
  assert.equal(provider.reasoning, "low");
});

test("explicit runtime OpenAI max output tokens override configured providers", () => {
  const [provider] = resolveProviders({
    config: {
      providers: {
        planner: {
          id: "planner",
          kind: "openai",
          model: "gpt-planner",
          maxOutputTokens: 99
        }
      }
    },
    providerList: "planner",
    runtime: {
      workspace: "C:/repo",
      timeoutMs: 1000,
      openaiMaxOutputTokens: 512
    }
  });

  assert.equal(provider.maxOutputTokens, 512);
});

test("renders command provider templates", () => {
  assert.equal(
    renderTemplate("{{id}}: {{prompt}} @ {{workspace}}", {
      id: "gemini",
      prompt: "hello",
      workspace: "C:/repo"
    }),
    "gemini: hello @ C:/repo"
  );
});
