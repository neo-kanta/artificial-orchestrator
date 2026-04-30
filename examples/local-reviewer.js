#!/usr/bin/env node

let input = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", () => {
  const goal = input.match(/^Goal:\s*(.+)$/m)?.[1] ?? "unknown";
  console.log(`1. Role perspective
Local reviewer received the prompt and can act as a no-cost fallback.

2. Recommended next action
Keep deterministic checks first for: ${goal}

3. Risks or constraints
This example provider is a stub, not an intelligent model.

4. Verification
The command-provider stdin path is working.

5. ORCHESTRATOR_STATUS: done`);
});
