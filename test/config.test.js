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
      timeoutMs: 1000,
      codexModel: "gpt-test",
      apply: false,
      unsafe: false
    }
  });

  assert.equal(providers[0].id, "local-reviewer");
  assert.equal(providers[0].workspace, "C:/repo");
  assert.equal(providers[1].id, "codex");
  assert.equal(providers[1].model, "gpt-test");
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
