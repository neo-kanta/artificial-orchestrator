import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir, platform } from "node:os";
import { delimiter, join } from "node:path";
import { runProcess } from "../src/process.js";

test("runs Windows command shims from PATH", { skip: platform() !== "win32" }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao process-"));
  const oldPath = process.env.PATH;
  const oldPathExt = process.env.PATHEXT;

  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
    restoreEnv("PATH", oldPath);
    restoreEnv("PATHEXT", oldPathExt);
  });

  await writeFile(join(dir, "fake-provider"), "echo extensionless shim should not run\n", "utf8");
  await writeFile(
    join(dir, "fake-provider.cmd"),
    "@echo off\r\necho first=%~1\r\necho second=%~2\r\necho third=%~3\r\n",
    "utf8"
  );
  process.env.PATH = `${dir}${delimiter}${oldPath ?? ""}`;
  process.env.PATHEXT = ".COM;.EXE;.BAT;.CMD";

  const result = await runProcess("fake-provider", ["arg", "two words", "%PATH%"], { timeoutMs: 5000 });
  if (!result.ok && /spawn EPERM/i.test(result.stderr)) {
    t.skip("sandbox blocked child process spawning");
    return;
  }

  assert.equal(result.ok, true);
  assert.match(result.stdout, /first=arg/);
  assert.match(result.stdout, /second=two words/);
  assert.match(result.stdout, /third=%PATH%/);
});

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
