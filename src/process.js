import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { delimiter, extname, join } from "node:path";

export function bin(name) {
  return commandSpec(name).command;
}

export function commandSpec(name) {
  if (platform() !== "win32") return { command: name, args: [] };

  const npmRoot = process.env.APPDATA ? join(process.env.APPDATA, "npm") : null;
  if (name === "codex" && npmRoot) {
    return {
      command: "node",
      args: [join(npmRoot, "node_modules", "@openai", "codex", "bin", "codex.js")]
    };
  }

  if (name === "claude" && npmRoot) {
    return {
      command: join(npmRoot, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
      args: []
    };
  }

  return { command: name, args: [] };
}

export function runCli(name, args = [], options = {}) {
  const spec = commandSpec(name);
  return runProcess(spec.command, [...spec.args, ...args], options);
}

export function runProcess(command, args = [], options = {}) {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const prepared = prepareProcessCommand(command, args);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child;

    try {
      child = spawn(prepared.command, prepared.args, {
        cwd: options.cwd,
        env: { ...process.env, ...(options.env ?? {}) },
        windowsHide: platform() === "win32",
        windowsVerbatimArguments: prepared.windowsVerbatimArguments ?? false,
        shell: false
      });
    } catch (error) {
      resolve({
        ok: false,
        code: 127,
        stdout,
        stderr: error.message,
        timedOut,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    if (child.stdin) child.stdin.end(options.input ?? "");

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderr?.(text);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: 127,
        stdout,
        stderr: stderr ? `${stderr}\n${error.message}` : error.message,
        timedOut,
        durationMs: Date.now() - startedAt
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        code,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt
      });
    });
  });
}

export function prepareProcessCommand(command, args = []) {
  if (platform() !== "win32") return { command, args };

  const resolved = resolveWindowsCommand(command);
  const extension = extname(resolved).toLowerCase();

  if (extension === ".cmd" || extension === ".bat") {
    const commandLine = [resolved, ...args].map(quoteCmdArg).join(" ");

    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", `"${commandLine}"`],
      windowsVerbatimArguments: true
    };
  }

  return { command: resolved, args };
}

function resolveWindowsCommand(command) {
  const extensions = windowsPathExtensions();

  for (const candidate of commandCandidates(command, extensions)) {
    if (existsSync(candidate)) return candidate;
  }

  if (hasPathSeparator(command)) return command;

  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const candidate of commandCandidates(join(dir, command), extensions)) {
      if (existsSync(candidate)) return candidate;
    }
  }

  return command;
}

function commandCandidates(command, extensions) {
  if (extname(command)) return [command];
  return [...extensions.map((extension) => `${command}${extension}`), command];
}

function windowsPathExtensions() {
  return (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);
}

function hasPathSeparator(command) {
  return command.includes("\\") || command.includes("/");
}

function quoteCmdArg(value) {
  const text = String(value);
  if (text && !/[\s&()^|<>"%]/.test(text)) return text;
  const escaped = text
    .replace(/\^/g, "^^")
    .replace(/%/g, "^%")
    .replace(/"/g, "\"\"");
  return `"${escaped}"`;
}
