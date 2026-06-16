import { runCli } from "../platform/process.js";
import { parseCodexJsonl, parseLimit } from "./parsers.js";

export async function callCodex(prompt, options) {
  const args = [
    "exec",
    "--ephemeral",
    "--json",
    "--color",
    "never",
    "--skip-git-repo-check",
    "-m",
    options.model,
    "-C",
    options.workspace
  ];

  if (options.unsafe) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else if (options.apply) {
    args.push("--full-auto", "--sandbox", "workspace-write");
  } else {
    args.push("--sandbox", "read-only");
  }

  args.push(prompt);

  const result = await runCli("codex", args, {
    cwd: options.workspace,
    timeoutMs: options.timeoutMs,
    env: {
      CODEX_DISABLE_PLUGIN_SYNC: "1"
    }
  });

  const parsed = parseCodexJsonl(result.stdout);
  const limit = result.ok ? null : parseLimit(`${parsed.errors.join("\n")}\n${result.stderr}`);

  return {
    provider: "codex",
    ok: result.ok && parsed.errors.length === 0,
    code: result.code,
    text: parsed.text || result.stdout.trim() || result.stderr.trim(),
    usage: parsed.usage,
    threadId: parsed.threadId,
    events: parsed.events,
    errors: parsed.errors,
    limit,
    stderr: scrubNoise(result.stderr),
    durationMs: result.durationMs
  };
}

function scrubNoise(stderr) {
  return stderr
    .split(/\r?\n/)
    .filter((line) => !line.includes("cdn-cgi/challenge-platform"))
    .filter((line) => !line.includes("<svg"))
    .filter((line) => !line.includes("<html>"))
    .join("\n")
    .trim();
}
