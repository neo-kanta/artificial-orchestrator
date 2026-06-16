import { callClaude } from "./claude.js";
import { callCodex } from "./codex.js";
import { callCommandProvider } from "./command.js";
import { callOpenAI } from "./openai.js";

export { callClaude } from "./claude.js";
export { callCodex } from "./codex.js";
export { callCommandProvider, renderTemplate } from "./command.js";
export { callOpenAI, parseOpenAIResponse } from "./openai.js";

export async function callProvider(provider, prompt) {
  if (provider.kind === "openai") return callOpenAI(prompt, provider);
  if (provider.kind === "codex") return callCodex(prompt, provider);
  if (provider.kind === "claude") return callClaude(prompt, provider);
  return callCommandProvider(prompt, provider);
}
