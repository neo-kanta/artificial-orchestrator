import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession, appendTurn } from "../src/logger.js";
import { tailLatest } from "../src/tail.js";

test("tail --follow streams appended transcript updates", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ao tail-follow-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const session = await createSession(root, "watch providers coordinate", {
    project: { name: "demo", path: root, source: "workspace" }
  });
  const controller = new AbortController();

  const outputPromise = captureStdout(() =>
    tailLatest(root, {
      follow: true,
      intervalMs: 5,
      signal: controller.signal
    })
  );

  await sleep(20);
  await appendTurn(session, {
    round: 1,
    provider: "reviewer",
    ok: true,
    text: "Provider update arrived.\n\nHandoff: builder should continue.",
    usage: null,
    usageLine: "usage: unavailable",
    costUsd: null,
    limit: null,
    errors: [],
    stderr: "",
    durationMs: 10
  });
  await sleep(30);
  controller.abort();

  const output = await outputPromise;
  assert.match(output, /Goal: watch providers coordinate/);
  assert.match(output, /Provider update arrived/);
  assert.match(output, /Handoff: builder should continue/);
});

async function captureStdout(fn) {
  const oldWrite = process.stdout.write;
  const chunks = [];
  process.stdout.write = (chunk, ...args) => {
    chunks.push(String(chunk));
    const callback = args.find((arg) => typeof arg === "function");
    callback?.();
    return true;
  };

  try {
    await fn();
  } finally {
    process.stdout.write = oldWrite;
  }

  return chunks.join("");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
