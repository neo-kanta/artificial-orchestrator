import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { main } from "../src/cli.js";

test("project CLI adds, lists, uses, and shows current projects", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao cli-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const registryPath = join(dir, "projects.json");
  const alphaPath = join(dir, "alpha");
  const betaPath = join(dir, "beta");

  const addAlpha = await captureStdout(() =>
    main(["project", "add", "alpha", "--path", alphaPath, "--project-registry", registryPath])
  );
  assert.match(addAlpha, /added: alpha/);
  assert.match(addAlpha, /active: yes/);

  await captureStdout(() => main(["project", "add", "beta", "--path", betaPath, "--project-registry", registryPath]));

  const list = await captureStdout(() => main(["projects", "--project-registry", registryPath]));
  assert.match(list, /\* alpha/);
  assert.match(list, /beta/);

  const useBeta = await captureStdout(() => main(["project", "use", "beta", "--project-registry", registryPath]));
  assert.match(useBeta, /active project: beta/);

  const current = await captureStdout(() => main(["project", "current", "--project-registry", registryPath]));
  assert.match(current, /active project: beta/);
  assert.match(current, /beta/);
});

test("org CLI lists and shows built-in organizations", async () => {
  const list = await captureStdout(() => main(["org", "list"]));
  assert.match(list, /software-team/);
  assert.match(list, /Software Team/);

  const show = await captureStdout(() => main(["org", "show", "software-team"]));
  assert.match(show, /manager\s+openai/);
  assert.match(show, /builder-claude\s+claude/);
  assert.match(show, /builder-codex\s+codex/);
});

test("run --org validates org mode before provider calls", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao org-cli-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      captureStdout(() =>
        main([
          "run",
          "--org",
          "missing-org",
          "--workspace",
          dir,
          "--goal",
          "coordinate this"
        ])
      ),
    /Unknown org/
  );
});

test("org run executes configured role pipeline and writes org state", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao org-run-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const configPath = join(dir, "artificial-orchestrator.config.json");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        providers: {
          fake: {
            label: "Fake Provider",
            kind: "command",
            role: "manager",
            command: "fake-provider",
            promptMode: "stdin",
            parser: "text",
            timeoutMs: 5000
          }
        },
        orgs: {
          tiny: {
            label: "Tiny Org",
            pipeline: ["manager"],
            roles: {
              manager: {
                provider: "fake",
                responsibility: "Finish immediately."
              }
            }
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const calls = [];
  await captureStdout(() =>
    main(["org", "run", "tiny", "--workspace", dir, "--config", configPath, "--goal", "coordinate"], {
      callProvider: async (provider, prompt) => {
        calls.push({ provider, prompt });
        return {
          ok: true,
          text: "Summary ok\nStatus: done",
          usage: null,
          costUsd: null,
          limit: null,
          errors: [],
          stderr: "",
          durationMs: 12
        };
      }
    })
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider.id, "manager");
  assert.equal(calls[0].provider.goal, "coordinate");
  assert.match(calls[0].prompt, /Durable organization state/);

  const latest = (await readFile(join(dir, ".duet", "latest"), "utf8")).trim();
  const orgState = JSON.parse(await readFile(join(latest, "org-state.json"), "utf8"));
  assert.equal(orgState.org.id, "tiny");
  assert.equal(orgState.phase, "done");
  assert.equal(orgState.roles.manager.status, "done");
});

test("org run uses the active project when no workspace or project is passed", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao org-active-project-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const registryPath = join(dir, "projects.json");
  const projectPath = join(dir, "active-project");
  const configPath = join(dir, "artificial-orchestrator.config.json");
  await mkdir(projectPath, { recursive: true });

  await captureStdout(() =>
    main(["project", "add", "alpha", "--path", projectPath, "--use", "--project-registry", registryPath])
  );

  await writeFile(
    configPath,
    JSON.stringify(
      {
        providers: {
          fake: {
            label: "Fake Provider",
            kind: "command",
            role: "manager",
            command: "fake-provider",
            promptMode: "stdin",
            parser: "text",
            timeoutMs: 5000
          }
        },
        orgs: {
          tiny: {
            label: "Tiny Org",
            pipeline: ["manager"],
            roles: {
              manager: {
                provider: "fake",
                responsibility: "Finish immediately."
              }
            }
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const calls = [];
  const output = await captureStdout(() =>
    main(["org", "run", "tiny", "--project-registry", registryPath, "--config", configPath, "--goal", "coordinate"], {
      callProvider: async (provider) => {
        calls.push({ provider });
        return {
          ok: true,
          text: "Summary ok\nStatus: done",
          usage: null,
          costUsd: null,
          limit: null,
          errors: [],
          stderr: "",
          durationMs: 12
        };
      }
    })
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider.workspace, resolve(projectPath));
  assert.match(output, /project: alpha/);
  assert.match(output, new RegExp(`workspace: ${escapeRegExp(resolve(projectPath))}`));

  const latest = (await readFile(join(projectPath, ".duet", "latest"), "utf8")).trim();
  const status = JSON.parse(await readFile(join(latest, "status.json"), "utf8"));
  assert.equal(status.project.name, "alpha");
});

test("tail uses the active project when no workspace or project is passed", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao tail-active-project-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const registryPath = join(dir, "projects.json");
  const projectPath = join(dir, "active-project");
  await mkdir(projectPath, { recursive: true });

  await captureStdout(() =>
    main(["project", "add", "alpha", "--path", projectPath, "--use", "--project-registry", registryPath])
  );

  await captureStdout(() =>
    main(["run", "--project-registry", registryPath, "--goal", "inspect active project"], {
      callProvider: async () => ({
        ok: true,
        text: "Active project inspected.\nDUET_STATUS: done",
        usage: null,
        costUsd: null,
        limit: null,
        errors: [],
        stderr: "",
        durationMs: 1
      })
    })
  );

  const output = await captureStdout(() => main(["tail", "--project-registry", registryPath]));
  assert.match(output, /Goal: inspect active project/);
  assert.match(output, /Project: alpha/);
  assert.match(output, /Active project inspected/);
});

test("status uses the active project and summarizes latest durable state", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao status-active-project-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const registryPath = join(dir, "projects.json");
  const projectPath = join(dir, "active-project");
  await mkdir(projectPath, { recursive: true });

  await captureStdout(() =>
    main(["project", "add", "alpha", "--path", projectPath, "--use", "--project-registry", registryPath])
  );

  await captureStdout(() =>
    main(["run", "--project-registry", registryPath, "--goal", "inspect durable status"], {
      callProvider: async () => ({
        ok: true,
        text: "Active project inspected.\n\nHandoff: archive latest session summary.\nDUET_STATUS: done",
        usage: null,
        costUsd: null,
        limit: null,
        errors: [],
        stderr: "",
        durationMs: 1
      })
    })
  );

  const output = await captureStdout(() => main(["status", "--project-registry", registryPath]));
  assert.match(output, /Artificial Orchestrator Status/);
  assert.match(output, /project: alpha/);
  assert.match(output, /phase: done/);
  assert.match(output, /final: done \(provider-reported-done\)/);
  assert.match(output, /providers:/);
  assert.match(output, /claude: ok/);
  assert.match(output, /latest handoff: archive latest session summary\./);
  assert.match(output, /transcript\.md/);

  const json = JSON.parse(await captureStdout(() => main(["status", "--project-registry", registryPath, "--json"])));
  assert.equal(json.status.project.name, "alpha");
  assert.equal(json.status.phase, "done");
  assert.equal(json.providerState.providers.claude.handoff, "archive latest session summary.");
});

test("providers doctor openai reports missing key without ping", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const output = await captureStdout(() => main(["providers", "doctor", "openai"]));
    assert.match(output, /fail\s+openai env/);
    assert.match(output, /OPENAI_API_KEY is not set/);
  } finally {
    restoreEnv("OPENAI_API_KEY", oldKey);
  }
});

test("run keeps configured OpenAI model unless CLI override is passed", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao cli-openai-config-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const configPath = join(dir, "artificial-orchestrator.config.json");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        providers: {
          planner: {
            label: "Planner",
            kind: "openai",
            role: "planner",
            model: "gpt-planner",
            reasoning: "low",
            responseFormat: "json"
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const models = [];
  const callProvider = async (provider) => {
    models.push(provider.model);
    return {
      ok: true,
      text: "Done.\nDUET_STATUS: done",
      usage: null,
      costUsd: null,
      limit: null,
      errors: [],
      stderr: "",
      durationMs: 1
    };
  };

  await captureStdout(() =>
    main(["run", "--workspace", dir, "--config", configPath, "--providers", "planner", "--goal", "plan"], {
      callProvider
    })
  );
  await captureStdout(() =>
    main(
      [
        "run",
        "--workspace",
        dir,
        "--config",
        configPath,
        "--providers",
        "planner",
        "--openai-model",
        "gpt-override",
        "--goal",
        "plan"
      ],
      { callProvider }
    )
  );

  assert.deepEqual(models, ["gpt-planner", "gpt-override"]);
});

test("run passes the goal into hydrated command providers", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao cli-provider-goal-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const configPath = join(dir, "artificial-orchestrator.config.json");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        providers: {
          local: {
            label: "Local Provider",
            kind: "command",
            role: "reviewer",
            command: "fake-provider",
            args: ["--goal", "{{goal}}"],
            promptMode: "stdin",
            parser: "text"
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const calls = [];
  await captureStdout(() =>
    main(["run", "--workspace", dir, "--config", configPath, "--providers", "local", "--goal", "review provider templates"], {
      callProvider: async (provider) => {
        calls.push(provider);
        return {
          ok: true,
          text: "Reviewed provider templates.\nDUET_STATUS: done",
          usage: null,
          costUsd: null,
          limit: null,
          errors: [],
          stderr: "",
          durationMs: 1
        };
      }
    })
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].goal, "review provider templates");
});

async function captureStdout(fn) {
  const oldLog = console.log;
  const oldWrite = process.stdout.write;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.join(" "));
  };
  process.stdout.write = (chunk, ...args) => {
    lines.push(String(chunk));
    const callback = args.find((arg) => typeof arg === "function");
    callback?.();
    return true;
  };

  try {
    await fn();
  } finally {
    console.log = oldLog;
    process.stdout.write = oldWrite;
  }

  return lines.join("\n");
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
