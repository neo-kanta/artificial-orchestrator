import { readFile, stat } from "node:fs/promises";

export async function assertWorkspaceDirectory(workspace) {
  try {
    const info = await stat(workspace);
    if (!info.isDirectory()) throw new Error(`Workspace is not a directory: ${workspace}`);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Workspace does not exist: ${workspace}`);
    throw error;
  }
}

export async function assertDirectory(path, label = "Path") {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) throw new Error(`${label} is not a directory: ${path}`);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`${label} does not exist: ${path}`);
    throw error;
  }
}

export async function readTail(path, maxChars) {
  const text = await readFile(path, "utf8");
  if (text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
}
