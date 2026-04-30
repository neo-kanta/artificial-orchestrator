import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readLatest } from "./logger.js";

export async function tailLatest(workspace) {
  const dir = await readLatest(workspace);
  const transcript = await readFile(join(dir, "transcript.md"), "utf8");
  console.log(transcript);
}
