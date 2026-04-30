import { runCli } from "./process.js";

export async function workspaceSnapshot(workspace) {
  const parts = [`cwd: ${workspace}`];

  const branch = await runCli("git", ["branch", "--show-current"], {
    cwd: workspace,
    timeoutMs: 5000
  });
  if (branch.ok && branch.stdout.trim()) parts.push(`branch: ${branch.stdout.trim()}`);

  const status = await runCli("git", ["status", "--short"], {
    cwd: workspace,
    timeoutMs: 5000
  });
  if (status.ok) {
    const lines = status.stdout.trim().split(/\r?\n/).filter(Boolean).slice(0, 80);
    parts.push(lines.length ? `git status:\n${lines.join("\n")}` : "git status: clean");
  } else {
    parts.push("git status: unavailable");
  }

  return parts.join("\n");
}
