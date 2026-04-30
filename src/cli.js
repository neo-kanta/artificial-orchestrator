import { resolve } from "node:path";
import { parseArgs } from "./args.js";
import { BUILT_IN_PROVIDERS, loadConfig, resolveProviders } from "./config.js";
import { doctor } from "./doctor.js";
import { runDuet } from "./orchestrator.js";
import { publishPrivate } from "./publish.js";
import { tailLatest } from "./tail.js";
import { addProject, currentProject, listProjects, resolveProjectContext, useProject } from "./projects.js";

const DEFAULT_CODEX_MODEL = "gpt-5.4-mini";

export async function main(argv) {
  const args = parseArgs(argv);
  const command = args._[0] ?? "help";

  if (command === "help" || args.help || args.h) {
    help();
    return;
  }

  const registryPath = args.projectRegistry ? resolve(String(args.projectRegistry)) : undefined;

  if (command === "project" || command === "projects") {
    await handleProjectCommand(args, registryPath);
    return;
  }

  const projectContext = await resolveProjectContext({
    projectName: args.project ? String(args.project) : undefined,
    workspace: args.workspace ?? args.w ?? (command === "run" ? undefined : process.cwd()),
    registryPath
  });
  const workspace = projectContext.path;
  const config = await loadConfig({ workspace, configPath: args.config });

  if (command === "doctor") {
    const ok = await doctor({
      workspace,
      ping: Boolean(args.ping),
      codexModel: String(args.codexModel ?? DEFAULT_CODEX_MODEL),
      maxBudgetUsd: args.maxBudgetUsd ?? 0.01
    });
    process.exitCode = ok ? 0 : 1;
    return;
  }

  if (command === "run") {
    const goal = String(args.goal ?? args.g ?? args._.slice(1).join(" ")).trim();
    if (!goal) throw new Error("Missing goal. Example: ao run --goal \"finish the market data tests\"");

    const timeoutMs = Number(args.timeoutMs ?? 15 * 60 * 1000);
    const providers = resolveProviders({
      config,
      providerList: args.providers,
      codexOnly: Boolean(args.codexOnly),
      claudeOnly: Boolean(args.claudeOnly),
      runtime: {
        workspace,
        timeoutMs,
        apply: Boolean(args.apply),
        unsafe: Boolean(args.unsafe),
        codexModel: String(args.codexModel ?? DEFAULT_CODEX_MODEL),
        claudeModel: args.claudeModel ? String(args.claudeModel) : undefined,
        maxBudgetUsd: args.maxBudgetUsd ?? undefined,
        claudeTools: Boolean(args.claudeTools)
      }
    });

    await runDuet({
      goal,
      workspace,
      project: projectContext,
      rounds: Number(args.rounds ?? args.r ?? 2),
      apply: Boolean(args.apply),
      historyChars: Number(args.historyChars ?? 12000),
      providers
    });
    return;
  }

  if (command === "providers") {
    const providers = { ...BUILT_IN_PROVIDERS, ...(config.providers ?? {}) };
    if (config.path) console.log(`config: ${config.path}`);
    for (const provider of Object.values(providers)) {
      console.log(`${provider.id}\t${provider.kind ?? "command"}\t${provider.role ?? "reviewer"}\t${provider.label ?? provider.id}`);
    }
    return;
  }

  if (command === "publish") {
    await publishPrivate({
      workspace,
      repo: args.repo ? String(args.repo) : undefined
    });
    return;
  }

  if (command === "tail") {
    await tailLatest(workspace);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function help() {
  console.log(`Artificial Orchestrator

Usage:
  ao doctor [--ping] [--workspace <path>]
  ao run --goal "<mission>" [--project <name>] [--workspace <path>] [--providers claude,codex] [--rounds 2] [--apply]
  ao project add <name> --path <path> [--use]
  ao project list
  ao project use <name>
  ao project current
  ao providers [--config <file>]
  ao tail [--workspace <path>]
  ao publish --repo <private-repo-name>

Commands:
  doctor   Check local codex, claude, git, gh, and optional API pings.
  run      Let Claude review/architect and Codex build/execute in rounds.
  project  Add, list, use, or show known workspaces.
  providers List built-in and configured AI providers.
  tail     Print the latest transcript for a workspace.
  publish  Create/push a private GitHub repo using gh auth.

Key options:
  --apply                 Allow Codex to edit the workspace. Without this, it plans only.
  --unsafe                Let Codex bypass approvals and sandbox. Use only in trusted worktrees.
  --codex-model <model>   Default: ${DEFAULT_CODEX_MODEL}
  --claude-model <model>  Optional Claude model alias/name.
  --providers <ids>       Comma-separated provider pipeline. Default: claude,codex.
  --project <name>        Run against a saved project.
  --config <file>         JSON config with custom command providers.
  --max-budget-usd <n>    Passed to Claude CLI when supported.
  --claude-tools          Allow Claude tools. Default keeps Claude as no-tools architect/reviewer.

Notes:
  The transcript shows public reasoning, decisions, outputs, and status. It does not expose private hidden chain-of-thought.
  Session files are stored under <workspace>/.duet/sessions/.
`);
}

async function handleProjectCommand(args, registryPath) {
  const action = String(args._[1] ?? (args._[0] === "projects" ? "list" : "current"));

  if (action === "add") {
    const name = args.name ?? args._[2];
    const path = args.path ?? args.workspace ?? args.w ?? args._[3] ?? process.cwd();
    const { project, registry } = await addProject({
      name,
      path,
      registryPath,
      setActive: Boolean(args.use)
    });
    console.log(`added: ${project.name}`);
    console.log(`path: ${project.path}`);
    console.log(`active: ${registry.active === project.name ? "yes" : "no"}`);
    return;
  }

  if (action === "list" || action === "ls") {
    const registryProjects = await listProjects({ registryPath });
    const active = await currentProject({ registryPath });
    if (registryProjects.length === 0) {
      console.log("No projects configured. Add one with ao project add <name> --path <path>.");
      return;
    }

    for (const project of registryProjects) {
      const marker = active?.name === project.name ? "*" : " ";
      console.log(`${marker} ${project.name}\t${project.path}`);
    }
    return;
  }

  if (action === "use") {
    const name = args.name ?? args._[2];
    const { project } = await useProject({ name, registryPath });
    console.log(`active project: ${project.name}`);
    console.log(`path: ${project.path}`);
    return;
  }

  if (action === "current") {
    const project = await currentProject({ registryPath });
    if (!project) {
      console.log("No active project. Add one with ao project add <name> --path <path> --use.");
      return;
    }
    console.log(`active project: ${project.name}`);
    console.log(`path: ${project.path}`);
    return;
  }

  throw new Error(`Unknown project command: ${action}`);
}
