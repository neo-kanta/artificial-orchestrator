import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { addProject, currentProject, listProjects, resolveProjectContext, useProject } from "../src/projects.js";

test("adds, lists, and switches projects", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao projects-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const registryPath = join(dir, "registry", "projects.json");
  const alphaPath = join(dir, "alpha");
  const betaPath = join(dir, "beta");

  await addProject({ name: "alpha", path: alphaPath, registryPath });
  await addProject({ name: "beta", path: betaPath, registryPath });

  assert.deepEqual(
    (await listProjects({ registryPath })).map((project) => project.name),
    ["alpha", "beta"]
  );
  assert.equal((await currentProject({ registryPath })).name, "alpha");

  await useProject({ name: "beta", registryPath });
  assert.equal((await currentProject({ registryPath })).path, resolve(betaPath));
});

test("resolves named, active, workspace, and cwd project contexts", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao context-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const registryPath = join(dir, "projects.json");
  const projectPath = join(dir, "repo");
  await addProject({ name: "demo", path: projectPath, registryPath, setActive: true });

  assert.deepEqual(await resolveProjectContext({ projectName: "demo", registryPath }), {
    name: "demo",
    path: resolve(projectPath),
    source: "named"
  });
  assert.equal((await resolveProjectContext({ registryPath })).source, "active");
  assert.equal((await resolveProjectContext({ workspace: projectPath, registryPath })).source, "registered-workspace");
  assert.equal((await resolveProjectContext({ cwd: dir, registryPath: join(dir, "empty.json") })).source, "cwd");
});

test("rejects unsafe project names", async () => {
  await assert.rejects(
    () => addProject({ name: "../repo", path: ".", registryPath: "unused.json" }),
    /Project names must/
  );
});
