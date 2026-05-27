import { compactText } from "../shared/text.js";

const NUMBERED_SECTION_BOUNDARY = new RegExp(
  `^\\s*\\d+[.)]\\s+(?:${[
    "Architecture direction",
    "Critical risks",
    "Concrete instructions for Codex",
    "Verification checklist",
    "Action taken or proposed",
    "Files changed or intended",
    "Tests/checks run or recommended",
    "Remaining blockers",
    "Role perspective",
    "Recommended next action",
    "Risks or constraints",
    "Verification",
    "DUET_STATUS",
    "ORCHESTRATOR_STATUS"
  ].join("|")})\\s*:?\\s*$`,
  "i"
);

export function formatTurnHandoff(turn, at, handoffText = handoffForTurn(turn)) {
  const meta = [
    `status: ${turn.ok ? "ok" : "blocked"}`,
    turn.usageLine,
    turn.limit ? `limit reset: ${turn.limit.reset}` : null,
    `duration: ${Math.round(turn.durationMs / 1000)}s`
  ]
    .filter(Boolean)
    .join(" | ");

  return [`## Round ${turn.round} - ${turn.provider}`, "", `at: ${at}`, meta, "", `Handoff: ${handoffText}`, ""].join("\n");
}

export function handoffForTurn(turn) {
  const structured = compactText(turn.structured?.handoff ?? "", 1600);
  if (structured) return structured;

  const labeled = extractHandoffSection(turn.text);
  if (labeled) return compactText(labeled, 1600);

  return compactText(turn.text || "(no output)", 1600);
}

function extractHandoffSection(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const handoffStart = lines.findIndex((line) => handoffHeader(line) !== null);
  if (handoffStart === -1) return "";

  const firstLine = handoffHeader(lines[handoffStart]);
  const collected = [];
  if (firstLine) collected.push(firstLine);

  for (const line of lines.slice(handoffStart + 1)) {
    if (sectionBoundary(line)) break;
    collected.push(line);
  }

  return collected.join("\n").trim();
}

function handoffHeader(line) {
  const match = stripMarkdown(line).match(
    /^\s*(?:\d+[.)]\s*)?handoff(?:\s+for\s+(?:next\s+(?:provider|role)|[A-Za-z0-9_.-]+))?\s*:?\s*(.*)$/i
  );
  return match ? match[1].trim() : null;
}

function sectionBoundary(line) {
  if (markdownHeading(line)) return true;

  const value = stripMarkdown(line).trim();
  if (!value) return false;
  if (/^\s*(?:\d+[.)]\s*)?(?:DUET_STATUS|ORCHESTRATOR_STATUS|Status|Blockers|Files suggested|Tests suggested)\s*:/i.test(value)) {
    return true;
  }

  return NUMBERED_SECTION_BOUNDARY.test(value);
}

function stripMarkdown(line) {
  return String(line ?? "")
    .replace(/^\s{0,3}>\s?/, "")
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s{0,3}[-*+]\s+/, "")
    .replace(/\*\*/g, "");
}

function markdownHeading(line) {
  return /^\s{0,3}#{1,6}\s+\S/.test(String(line ?? ""));
}
