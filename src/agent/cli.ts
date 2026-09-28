// src/agent/cli.ts
/**
 * Universal Terminal CLI for Web Browsing Agent
 * Supports dual modes:
 * 1. Cloud LLM (Google Gemini API via GEMINI_API_KEY in .env.local)
 * 2. Local SLM (Ollama open-weights models >= 1B parameters)
 */

import readline from "readline";
import {
  loadEnvConfig,
  resolveAgentConfig,
  type ResolvedAgentConfig,
  getGeminiApiKey,
} from "./config";
import { runAgent } from "./orchestrator";
import type { AgentMode, AgentOptions, AgentStepEvent } from "./types";

// Ensure environment files (.env.local, .env) are loaded
loadEnvConfig();

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

interface ParsedCliArgs {
  mode?: AgentMode;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  initialQuery?: string;
}

/**
 * Parse command line arguments for flags, mode, model, and search query
 */
function parseArgs(): ParsedCliArgs {
  let mode: AgentMode | undefined;
  let model: string | undefined;
  let baseUrl: string | undefined;
  let apiKey: string | undefined;
  const remainingArgs: string[] = [];

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === "--llm" || arg === "--gemini") {
      mode = "llm";
    } else if (arg === "--local" || arg === "--ollama") {
      mode = "local";
    } else if (arg.startsWith("--mode=")) {
      const val = arg.split("=")[1].trim().toLowerCase();
      mode = val === "local" ? "local" : "llm";
    } else if (arg === "--mode" && i + 1 < process.argv.length) {
      const val = process.argv[++i].trim().toLowerCase();
      mode = val === "local" ? "local" : "llm";
    } else if (arg.startsWith("--model=")) {
      model = arg.split("=")[1].trim();
    } else if (arg === "--model" && i + 1 < process.argv.length) {
      model = process.argv[++i].trim();
    } else if (arg.startsWith("--base-url=")) {
      baseUrl = arg.split("=")[1].trim();
    } else if (arg === "--base-url" && i + 1 < process.argv.length) {
      baseUrl = process.argv[++i].trim();
    } else if (arg.startsWith("--api-key=")) {
      apiKey = arg.split("=")[1].trim();
    } else if (arg === "--api-key" && i + 1 < process.argv.length) {
      apiKey = process.argv[++i].trim();
    } else if (arg !== "--") {
      remainingArgs.push(arg);
    }
  }

  // Check if first positional argument specifies mode ('local' or 'llm')
  if (remainingArgs.length > 0) {
    const firstLower = remainingArgs[0].toLowerCase();
    if (firstLower === "local" || firstLower === "ollama") {
      mode = "local";
      remainingArgs.shift();
    } else if (firstLower === "llm" || firstLower === "gemini") {
      mode = "llm";
      remainingArgs.shift();
    }
  }

  // Auto-detect if next positional argument is a model name
  if (remainingArgs.length > 1) {
    const candidate = remainingArgs[0].toLowerCase();
    if (
      candidate.includes(":") ||
      candidate.startsWith("gemini") ||
      candidate.startsWith("qwen") ||
      candidate.startsWith("llama") ||
      candidate.startsWith("deepseek") ||
      candidate.startsWith("mistral") ||
      candidate.startsWith("gemma")
    ) {
      model = remainingArgs.shift();
      if (model && model.toLowerCase().includes("gemini")) {
        mode = "llm";
      }
    }
  }

  const initialQuery =
    remainingArgs.length > 0 ? remainingArgs.join(" ").trim() : undefined;

  return { mode, model, baseUrl, apiKey, initialQuery };
}

/**
 * Render the startup banner with active mode and model information
 */
function printBanner(config: ResolvedAgentConfig) {
  const isCloud = config.mode === "llm";
  const modeLabel = isCloud
    ? `${colors.magenta}${colors.bold}Cloud LLM (Google Gemini API)${colors.reset}`
    : `${colors.cyan}${colors.bold}Local SLM (Ollama Open-Weights)${colors.reset}`;

  const keyStatus = isCloud
    ? config.apiKey
      ? `${colors.green}Configured (from .env.local)${colors.reset}`
      : `${colors.red}Missing GEMINI_API_KEY${colors.reset}`
    : `${colors.dim}Not required (100% offline)${colors.reset}`;

  console.log(
    `\n${colors.cyan}${colors.bold}===============================================================================${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bold}  🌐 UNIVERSAL WEB BROWSING AGENT (LOCAL SLM & CLOUD GEMINI LLM)             ${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bold}===============================================================================${colors.reset}`
  );
  console.log(`  ${colors.bold}Execution Mode:${colors.reset}     ${modeLabel}`);
  console.log(
    `  ${colors.bold}Active Model:${colors.reset}       ${colors.green}${config.model}${colors.reset}`
  );
  console.log(
    `  ${colors.bold}Detected Tier:${colors.reset}      ${colors.yellow}${config.tierConfig.name}${colors.reset}`
  );
  console.log(
    `  ${colors.bold}API Endpoint:${colors.reset}       ${colors.dim}${config.baseUrl}${colors.reset}`
  );
  console.log(`  ${colors.bold}API Key Status:${colors.reset}     ${keyStatus}`);
  console.log(
    `  ${colors.bold}Max Scrape Context:${colors.reset} ${config.tierConfig.maxWordsPerScrape} words`
  );
  console.log(
    `  ${colors.bold}Max Tool Budget:${colors.reset}    ${config.tierConfig.maxSteps} steps`
  );
  console.log(
    `  ${colors.bold}Temperature:${colors.reset}        ${config.tierConfig.temperature}`
  );
  console.log(
    `${colors.cyan}-------------------------------------------------------------------------------${colors.reset}\n`
  );
}

/**
 * Handle step events and render real-time progress in terminal
 */
function handleStepEvent(event: AgentStepEvent) {
  switch (event.type) {
    case "thinking":
      console.log(
        `${colors.dim}  [Step ${event.step}/${event.maxSteps}] 🧠 ${event.message}${colors.reset}`
      );
      break;

    case "tool_call":
      console.log(
        `  ${colors.yellow}${colors.bold}⚡ Invoking Tool:${colors.reset} ${colors.yellow}${event.toolName}${colors.reset} ` +
          `${colors.dim}${JSON.stringify(event.toolArgs || {})}${colors.reset}`
      );
      break;

    case "tool_result":
      console.log(
        `  ${colors.green}✔ ${event.toolName} completed:${colors.reset} ${colors.dim}${event.toolResultSnippet}${colors.reset}`
      );
      break;

    case "synthesizing":
      console.log(
        `  ${colors.magenta}${colors.bold}📝 ${event.message}${colors.reset}`
      );
      break;

    case "error":
      console.log(
        `  ${colors.red}${colors.bold}✖ ${event.message}${colors.reset}`
      );
      break;
  }
}

/**
 * Execute a search query through the agent orchestrator
 */
async function executeQuery(query: string, options?: AgentOptions) {
  console.log(
    `\n${colors.bold}User Query:${colors.reset} "${colors.cyan}${query}${colors.reset}"\n`
  );

  try {
    const result = await runAgent(query, {
      ...options,
      onStep: handleStepEvent,
    });

    const modeTag =
      result.mode === "llm" ? "Cloud Gemini LLM" : `Local Tier ${result.tier}`;

    console.log(
      `\n${colors.green}${colors.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
    );
    console.log(
      `${colors.green}${colors.bold}  SYNTHESIZED ANSWER (${result.modelUsed} | ${modeTag} | ${result.latencyMs}ms)${colors.reset}`
    );
    console.log(
      `${colors.green}${colors.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`
    );
    console.log(result.answer);

    if (result.sources && result.sources.length > 0) {
      console.log(
        `\n${colors.bold}${colors.dim}--- Discovered Web Sources (${result.sources.length}) ---${colors.reset}`
      );
      for (const source of result.sources) {
        console.log(`  ${colors.dim}• ${source}${colors.reset}`);
      }
    }
    console.log();
  } catch (err: any) {
    console.error(
      `\n${colors.red}${colors.bold}Error running agent:${colors.reset} ${err?.message || String(err)}\n`
    );
  }
}

/**
 * Ask user to pick a mode if not specified on CLI
 */
function askModeChoice(rl: readline.Interface): Promise<AgentMode> {
  return new Promise((resolve) => {
    const hasKey = !!getGeminiApiKey();
    console.log(`${colors.bold}Select Agent Execution Mode:${colors.reset}`);
    console.log(
      `  ${colors.green}[1] Cloud LLM (Google Gemini API)${colors.reset} ${hasKey ? `${colors.dim}(Key detected in .env.local)${colors.reset}` : `${colors.red}(Requires key)${colors.reset}`}`
    );
    console.log(
      `  ${colors.cyan}[2] Local SLM (Ollama Model)${colors.reset} ${colors.dim}(Offline / Private)${colors.reset}`
    );

    rl.question(
      `\n${colors.bold}Choose mode [1/2, default: 1]: ${colors.reset}`,
      (answer) => {
        const trimmed = answer.trim();
        if (trimmed === "2") {
          resolve("local");
        } else {
          resolve("llm");
        }
      }
    );
  });
}

/**
 * Main CLI entrypoint
 */
async function main() {
  const cliArgs = parseArgs();

  // If a direct query was provided via CLI arguments, run it immediately
  if (cliArgs.initialQuery) {
    const resolved = resolveAgentConfig({
      mode: cliArgs.mode,
      model: cliArgs.model,
      baseUrl: cliArgs.baseUrl,
      apiKey: cliArgs.apiKey,
    });
    printBanner(resolved);
    await executeQuery(cliArgs.initialQuery, {
      mode: resolved.mode,
      model: resolved.model,
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey,
    });
    process.exit(0);
  }

  // Interactive CLI mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let selectedMode = cliArgs.mode;
  if (!selectedMode) {
    selectedMode = await askModeChoice(rl);
  }

  const resolved = resolveAgentConfig({
    mode: selectedMode,
    model: cliArgs.model,
    baseUrl: cliArgs.baseUrl,
    apiKey: cliArgs.apiKey,
  });

  printBanner(resolved);

  const promptUser = () => {
    rl.question(
      `${colors.bold}${colors.cyan}Enter search query${colors.reset} (or 'exit' to quit): `,
      async (answer) => {
        const trimmed = answer.trim();
        if (
          !trimmed ||
          trimmed.toLowerCase() === "exit" ||
          trimmed.toLowerCase() === "quit"
        ) {
          console.log(`\n${colors.dim}Exiting agent. Goodbye!${colors.reset}\n`);
          rl.close();
          process.exit(0);
        }

        await executeQuery(trimmed, {
          mode: resolved.mode,
          model: resolved.model,
          baseUrl: resolved.baseUrl,
          apiKey: resolved.apiKey,
        });
        promptUser();
      }
    );
  };

  promptUser();
}

main().catch((err) => {
  console.error("Fatal CLI error:", err);
  process.exit(1);
});
