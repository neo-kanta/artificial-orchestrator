const enabled = process.stdout.isTTY && process.env.NO_COLOR !== "1";

const codes = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m"
};

export function color(name, text) {
  if (!enabled || !codes[name]) return text;
  return `${codes[name]}${text}${codes.reset}`;
}

export function mark(status) {
  if (status === "ok") return color("green", "ok");
  if (status === "warn") return color("yellow", "warn");
  if (status === "fail") return color("red", "fail");
  return status;
}
