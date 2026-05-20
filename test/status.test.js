import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatLatestStatus, latestStatus } from "../src/status.js";

test("latest status falls back to status.json when provider state is missing", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao status-legacy-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const session = join(root, ".duet", "sessions", "legacy");
  await mkdir(session, { recursive: true });
  await writeFile(join(root, ".duet", "latest"), session, "utf8");
  await writeFile(
    join(session, "status.json"),
    JSON.stringify(
      {
        goal: "inspect a legacy session",
        phase: "blocked",
        project: { name: "legacy", path: root },
        final: {
          status: "blocked",
          reason: "provider-blocked",
          provider: "reviewer",
          round: 1,
          blockers: ["missing credentials"]
        },
        providers: {
          reviewer: { ok: false, limit: null }
        },
        blockers: [{ blocker: "missing credentials" }]
      },
      null,
      2
    ),
    "utf8"
  );

  const run = await latestStatus(root);
  assert.equal(run.providerState, null);

  const formatted = formatLatestStatus(run);
  assert.match(formatted, /phase: blocked/);
  assert.match(formatted, /goal: inspect a legacy session/);
  assert.match(formatted, /reviewer: blocked/);
  assert.match(formatted, /missing credentials/);
});
