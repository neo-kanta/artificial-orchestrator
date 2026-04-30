import test from "node:test";
import assert from "node:assert/strict";
import { listOrgs, resolveOrg } from "../src/orgs.js";

test("lists built-in software team org", () => {
  const orgs = listOrgs();
  assert.equal(orgs.some((org) => org.id === "software-team"), true);
});

test("resolves software team roles to hydrated providers", () => {
  const org = resolveOrg({
    config: {},
    orgName: "software-team",
    runtime: {
      workspace: "C:/repo",
      timeoutMs: 1000,
      codexModel: "gpt-codex-test",
      openaiModel: "gpt-openai-test",
      openaiReasoning: "high",
      apply: false,
      unsafe: false
    }
  });

  assert.deepEqual(org.pipeline, ["manager", "architect", "builder", "tester", "reviewer", "security", "docs"]);

  const manager = org.roles.find((role) => role.id === "manager");
  assert.equal(manager.kind, "openai");
  assert.equal(manager.providerId, "openai");
  assert.equal(manager.model, "gpt-openai-test");
  assert.equal(manager.reasoning, "high");

  const builder = org.roles.find((role) => role.id === "builder");
  assert.equal(builder.kind, "codex");
  assert.equal(builder.providerId, "codex");
  assert.equal(builder.model, "gpt-codex-test");
});

test("resolves configured orgs and providers", () => {
  const org = resolveOrg({
    config: {
      providers: {
        analyst: {
          id: "analyst",
          kind: "command",
          command: "node",
          role: "analyst"
        }
      },
      orgs: {
        research: {
          id: "research",
          pipeline: ["analyst"],
          roles: {
            analyst: {
              provider: "analyst",
              responsibility: "Inspect evidence."
            }
          }
        }
      }
    },
    orgName: "research",
    runtime: { workspace: "C:/repo", timeoutMs: 1000 }
  });

  assert.equal(org.roles[0].id, "analyst");
  assert.equal(org.roles[0].kind, "command");
  assert.equal(org.roles[0].command, "node");
});
