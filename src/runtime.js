export const DEFAULT_CODEX_MODEL = "gpt-5.4-mini";
export const DEFAULT_OPENAI_MODEL = "gpt-5.5";

export function runtimeOptions(args = {}, workspace) {
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
