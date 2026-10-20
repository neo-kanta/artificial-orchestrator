import test from "node:test";
import assert from "node:assert/strict";
import { orderedProviderIds, providerDisplayOrder, updateProviderOrder } from "../desktop/renderer/provider-order.js";

test("provider order retains selection sequence and removes stale entries", () => {
  assert.deepEqual(orderedProviderIds(["codex", "codex", "unknown", "claude"], ["claude", "codex"]), ["codex", "claude"]);
  assert.deepEqual(updateProviderOrder(["claude"], "codex", true, ["claude", "codex"]), ["claude", "codex"]);
  assert.deepEqual(updateProviderOrder(["claude", "codex"], "claude", false, ["claude", "codex"]), ["codex"]);
});

test("provider display order places selected pipeline steps first", () => {
  const display = providerDisplayOrder(
    [
      { id: "claude", label: "Claude" },
      { id: "codex", label: "Codex" },
      { id: "openai", label: "OpenAI" }
    ],
    ["codex", "claude"]
  );

  assert.deepEqual(
    display.map((provider) => [provider.id, provider.pipelineStep]),
    [
      ["codex", 1],
      ["claude", 2],
      ["openai", null]
    ]
  );
});
