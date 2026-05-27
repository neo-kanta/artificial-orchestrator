export function compactText(text, maxChars) {
  const normalized = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 80)).trim()}\n\n[truncated: ${normalized.length - maxChars} chars omitted]`;
}

export function compactLine(value, maxChars) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 15)).trim()}... [truncated]`;
}
