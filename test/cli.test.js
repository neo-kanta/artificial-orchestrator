import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function captureStdout(fn) {
  const oldLog = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.join(" "));
  };

  try {
    await fn();
  } finally {
    console.log = oldLog;
  }

  return lines.join("\n");
}
