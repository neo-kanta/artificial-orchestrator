#!/usr/bin/env node
import { readFileSync } from "node:fs";

const prompt = readFileSync(0, "utf8");
const goal = matchLine(/^Goal:\s*(.+)$/m, prompt) ?? "the requested orchestration task";
const round = matchLine(/^Round:\s*(.+)$/m, prompt) ?? "unknown";
const role = detectRole(prompt);
const workspaceHints = detectWorkspaceHints(prompt);
const applyMode = /may edit the workspace|mode:\s*apply/i.test(prompt);
const finalRole = isFinalRole(prompt, role);

const checks = [
  "Read the latest durable handoff before changing direction.",
  "Prefer deterministic repo inspection and tests over repeated model calls.",
  "Keep edits scoped; do not revert unrelated user changes.",
  "Record exact commands and results in the handoff.",
  "Stop and surface a blocker for credentials, destructive operations, or missing workspace access."
];

const filesSuggested = [
  "AGENTS.md",
  "docs/advisor.md",
  "artificial-orchestrator.config.json",
  "src/orchestration/prompts.js",
  "src/platform/orgs.js"
];

const testsSuggested = [
  "npm test",
  "node ./bin/duet.js doctor",
  "node ./bin/duet.js org show advisor-council"
];

const text = [
  `# Local Advisor Fallback (${role})`,
  "",
  `Round: ${round}`,
  `Goal: ${goal}`,
  "",
  "A remote or paid model was unavailable, so this deterministic advisor is providing a safe continuation path.",
  "",
  "## Recommended approach",
  "- Start with an implementation plan before any write operation.",
  "- Use Claude/Codex when available for architecture review and edits; otherwise continue with local file inspection, tests, and explicit manual instructions.",
  `- Current mode appears to be ${applyMode ? "apply-capable; still keep changes scoped." : "plan-only; propose changes and commands instead of editing target workspaces."}`,
  "- Treat this output as a checklist, not as a substitute for high-risk domain judgment.",
  "",
  "## Workspace signals to inspect",
  ...workspaceHints.map((hint) => `- ${hint}`),
  "",
  "## Safety checklist",
  ...checks.map((check) => `- ${check}`),
  "",
  "## Suggested files",
  ...filesSuggested.map((file) => `- ${file}`),
  "",
  "## Suggested checks",
  ...testsSuggested.map((check) => `- ${check}`),
  "",
  "## Handoff",
  finalRole
    ? "Advisory package is complete when the transcript lists the plan, fallback path, verification commands, and any unresolved blockers."
    : "Next role should use this checklist, inspect the repo, and either perform scoped changes or produce exact manual steps.",
  "",
  `Status: ${finalRole ? "done" : "continue"}`
].join("\n");

const output = {
  text,
  summary: finalRole
    ? "Local fallback synthesized final advisory guidance."
    : "Local fallback produced deterministic advisory guidance.",
  handoff: finalRole
    ? "Final advisor completed fallback synthesis. Review transcript and run suggested checks."
    : "Use the local advisor checklist, then continue with the next configured role.",
  status: finalRole ? "done" : "continue",
  blockers: [],
  filesSuggested,
  testsSuggested
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

function matchLine(pattern, value) {
  return value.match(pattern)?.[1]?.trim();
}

function detectRole(value) {
  return (
    matchLine(/^You are the\s+(.+?)\s+role\b/im, value) ??
    matchLine(/^You are\s+(.+?)\s+inside Artificial Orchestrator\b/im, value) ??
    "local-advisor"
  );
}

function isFinalRole(value, roleName) {
  // Prefer the explicit pipeline-position signal injected by the org prompt so the
  // deterministic fallback works for ANY terminal role name, not just "final-advisor".
  if (/Pipeline position:\s*FINAL role/i.test(value)) return true;
  if (/Pipeline position:\s*intermediate role/i.test(value)) return false;
  // Fallback heuristic for prompts without the explicit signal (older callers/tests).
  return /\bfinal\b/i.test(roleName);
}

function detectWorkspaceHints(value) {
  const hints = [];
  const snapshot = value.split("Workspace snapshot:")[1]?.split(/\nRecent (?:duet )?transcript:/i)[0] ?? "";
  for (const line of snapshot.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean) continue;
    if (/^(git status|files|package|workspace|branch|changes):/i.test(clean) || clean.startsWith("- ")) {
      hints.push(clean.replace(/^- /, ""));
    }
    if (hints.length >= 8) break;
  }

  return hints.length > 0 ? hints : ["Run a lightweight workspace snapshot, inspect changed files, then run the smallest relevant verification command."];
}
