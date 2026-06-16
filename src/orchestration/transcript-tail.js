import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readLatest } from "./session-store.js";

export async function tailLatest(workspace, options = {}) {
  const dir = await readLatest(workspace);
  const transcriptPath = join(dir, "transcript.md");
  let transcript = await readFile(transcriptPath, "utf8");
  writeChunk(transcript);

  if (!options.follow) return;

  while (!options.signal?.aborted) {
    await sleep(Number(options.intervalMs ?? 1000), options.signal);
    if (options.signal?.aborted) break;

    const next = await readFile(transcriptPath, "utf8");
    if (next.length < transcript.length) {
      writeChunk(next);
      transcript = next;
      continue;
    }

    if (next.length > transcript.length) {
      writeChunk(next.slice(transcript.length));
      transcript = next;
    }
  }
}

function writeChunk(value) {
  process.stdout.write(value.endsWith("\n") ? value : `${value}\n`);
}

function sleep(ms, signal) {
  if (signal?.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}
