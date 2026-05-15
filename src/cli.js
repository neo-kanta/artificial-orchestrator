import { resolve } from "node:path";
import { parseArgs } from "./args.js";
import { BUILT_IN_PROVIDERS, loadConfig, resolveProviders } from "./config.js";
import { doctor } from "./doctor.js";
import { runDuet } from "./orchestrator.js";
import { publishPrivate } from "./publish.js";
import { tailLatest } from "./tail.js";
import { addProject, currentProject, listProjects, resolveProjectContext, useProject } from "./projects.js";
import { listOrgs, orgSummary, resolveOrg } from "./orgs.js";
import { callProvider as defaultCallProvider } from "./providers.js";

const DEFAULT_CODEX_MODEL = "gpt-5.4-mini";
const DEFAULT_OPENAI_MODEL = "gpt-5.5";

export async function main(argv, deps = {}) {
  const args = parseArgs(argv);
  const command = args._[0] ?? "help";
  const callProvider = deps.callProvider ?? defaultCallProvider;

  if (command === "help" || args.help || args.h) {
    help();
    return;
  }

  const registryPath = args.projectRegistry ? resolve(String(args.projectRegistry)) : undefined;

  if (command === "project" || command === "projects") {
    await handleProjectCommand(args, registryPath);
    return;
  }

  const useActiveProjectDefault = usesActiveProjectDefault(args, command);
  const projectContext = await resolveProjectContext({
    projectName: args.project ? String(args.project) : undefined,
    workspace: args.workspace ?? args.w ?? (useActiveProjectDefault ? undefined : process.cwd()),
    registryPath
  });
  const workspace = projectContext.path;
  const config = await loadConfig({ workspace, configPath: args.config });
  const runtime = runtimeOptions(args, workspace);

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

    const org = args.org
      ? resolveOrg({ config, orgName: String(args.org), runtime })
      : null;
    const providers = org
      ? []
      : resolveProviders({
          config,
          providerList: args.providers,
          codexOnly: Boolean(args.codexOnly),
          claudeOnly: Boolean(args.claudeOnly),
          runtime
        });

    await runDuet({
      goal,
      workspace,
      project: projectContext,
      org,
      rounds: Number(args.rounds ?? args.r ?? 2),
      apply: Boolean(args.apply),
      historyChars: Number(args.historyChars ?? 12000),
      providers,
      callProvider
    });
    return;
  }

  if (command === "org" || command === "orgs") {
    await handleOrgCommand(args, config, runtime, { goalArgsStart: 3, workspace, projectContext, callProvider });
    return;
  }

  if (command === "providers") {
    if (args._[1] === "doctor") {
      await handleProviderDoctor(args, config, runtime, callProvider);
      return;
    }

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
  ao run --org software-team --goal "<mission>"
  ao org list
  ao org show software-team
  ao org run software-team --goal "<mission>"
  ao project add <name> --path <path> [--use]
  ao project list
  ao project use <name>
  ao project current
  ao providers [--config <file>]
  ao tail [--project <name>] [--workspace <path>]
  ao publish --repo <private-repo-name>

Commands:
  doctor   Check local codex, claude, git, gh, and optional API pings.
  run      Let Claude review/architect and Codex build/execute in rounds.
  org      List or run AI organizations such as software-team.
  project  Add, list, use, or show known workspaces.
  providers List built-in and configured AI providers.
  tail     Print the latest transcript for a project or workspace.
  publish  Create/push a private GitHub repo using gh auth.

Key options:
  --apply                 Allow Codex to edit the workspace. Without this, it plans only.
  --unsafe                Let Codex bypass approvals and sandbox. Use only in trusted worktrees.
  --codex-model <model>   Default: ${DEFAULT_CODEX_MODEL}
  --claude-model <model>  Optional Claude model alias/name.
  --providers <ids>       Comma-separated provider pipeline. Default: claude,codex.
  --org <name>            Run a built-in or configured AI organization.
  --openai-model <model>  Default: ${DEFAULT_OPENAI_MODEL}
  --project <name>        Run against a saved project.
  --config <file>         JSON config with custom command providers.
  --max-budget-usd <n>    Passed to Claude CLI when supported.
  --claude-tools          Allow Claude tools. Default keeps Claude as no-tools architect/reviewer.

Notes:
  The transcript shows public reasoning, decisions, outputs, and status. It does not expose private hidden chain-of-thought.
  Session files are stored under <workspace>/.duet/sessions/.
`);
}

function usesActiveProjectDefault(args, command) {
  if (command === "run") return true;
  if (command === "tail") return true;
  if (command !== "org" && command !== "orgs") return false;
  return String(args._[1] ?? "").toLowerCase() === "run";
}

function runtimeOptions(args, workspace) {
  return {
    workspace,
    timeoutMs: Number(args.timeoutMs ?? 15 * 60 * 1000),
    apply: Boolean(args.apply),
    unsafe: Boolean(args.unsafe),
    codexModel: String(args.codexModel ?? DEFAULT_CODEX_MODEL),
    claudeModel: args.claudeModel ? String(args.claudeModel) : undefined,
    openaiModel: args.openaiModel !== undefined ? String(args.openaiModel) : undefined,
    openaiReasoning: args.openaiReasoning ? String(args.openaiReasoning) : undefined,
    openaiMaxOutputTokens: args.openaiMaxOutputTokens ? Number(args.openaiMaxOutputTokens) : undefined,
    maxBudgetUsd: args.maxBudgetUsd ?? undefined,
    claudeTools: Boolean(args.claudeTools)
  };
}

async function handleOrgCommand(args, config, runtime, context) {
  const action = String(args._[1] ?? (args._[0] === "orgs" ? "list" : "list"));

  if (action === "list" || action === "ls") {
    for (const org of listOrgs(config)) {
      console.log(`${org.id}\t${org.label ?? org.id}\t${org.description ?? ""}`);
    }
    return;
  }

  if (action === "show") {
    const orgName = String(args._[2] ?? "");
    if (!orgName) throw new Error("Missing org name. Example: ao org show software-team");
    const org = resolveOrg({ config, orgName, runtime });
    console.log(orgSummary(org));
    return;
  }

  if (action === "run") {
    const orgName = String(args._[2] ?? "");
    if (!orgName) throw new Error("Missing org name. Example: ao org run software-team --goal \"ship safely\"");
    const goal = String(args.goal ?? args.g ?? args._.slice(context.goalArgsStart).join(" ")).trim();
    if (!goal) throw new Error("Missing goal. Example: ao org run software-team --goal \"ship safely\"");
    const org = resolveOrg({ config, orgName, runtime });

    await runDuet({
      goal,
      workspace: context.workspace,
      project: context.projectContext,
      org,
      providers: [],
      rounds: Number(args.rounds ?? args.r ?? 1),
      apply: Boolean(args.apply),
      historyChars: Number(args.historyChars ?? 12000),
      callProvider: context.callProvider
    });
    return;
  }

  throw new Error(`Unknown org command: ${action}`);
}

async function handleProviderDoctor(args, config, runtime, callProvider) {
  const id = String(args._[2] ?? "");
  if (!id) throw new Error("Missing provider id. Example: ao providers doctor openai");

  const [provider] = resolveProviders({ config, providerList: id, runtime });
  if (provider.kind === "openai") {
    const hasKey = Boolean(process.env.OPENAI_API_KEY);
    console.log(`${hasKey ? "ok" : "fail"}\topenai env\t${hasKey ? "OPENAI_API_KEY is set" : "OPENAI_API_KEY is not set"}`);

    if (args.ping && hasKey) {
      const result = await callProvider({ ...provider, responseFormat: "text" }, "Reply with exactly: openai ok");
      console.log(`${result.ok && /openai ok/i.test(result.text) ? "ok" : "fail"}\topenai ping\t${result.text || result.errors?.[0] || "unavailable"}`);
    }
    return;
  }

  console.log(`ok\t${provider.id}\tconfigured as ${provider.kind ?? "command"}`);
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
