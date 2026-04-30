import { runCli } from "./process.js";

export async function publishPrivate(options) {
  const auth = await runCli("gh", ["auth", "status"], {
    cwd: options.workspace,
    timeoutMs: 30000
  });

  if (!auth.ok) {
    throw new Error("GitHub CLI is not authenticated. Run `gh auth login`, then rerun `ao publish --repo <name>`.");
  }

  const existingRemote = await runCli("git", ["remote", "get-url", "origin"], {
    cwd: options.workspace,
    timeoutMs: 10000
  });

  if (existingRemote.ok && existingRemote.stdout.trim()) {
    await mustRun("git", ["push", "-u", "origin", currentBranch(options.workspace)], options.workspace);
    console.log(`Pushed existing origin: ${existingRemote.stdout.trim()}`);
    return;
  }

  const repo = options.repo || "artificial-orchestrator";
  await mustRun(
    "gh",
    ["repo", "create", repo, "--private", "--source", ".", "--remote", "origin", "--push"],
    options.workspace
  );
  console.log(`Created private GitHub repository and pushed: ${repo}`);
}

async function mustRun(command, args, cwd) {
  const result = await runCli(command, args, { cwd, timeoutMs: 120000 });
  if (!result.ok) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return result;
}

function currentBranch(cwd) {
  return process.env.DUET_BRANCH || "HEAD";
}
