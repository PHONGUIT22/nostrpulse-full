// src/agent/config.ts
/**
 * Dynamic Model Tier & Parameter Configuration
 * Supports both Local SLMs (via Ollama) and Cloud LLMs (via Google Gemini API).
 */

import fs from "fs";
import path from "path";
import type { AgentMode, AgentOptions, ModelTier, TierConfig } from "./types";

/**
 * Load environment variables safely from .env.local and .env
 */
export function loadEnvConfig(): void {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    try {
      const fullPath = path.resolve(process.cwd(), file);
      if (fs.existsSync(fullPath)) {
        if (typeof process.loadEnvFile === "function") {
          try {
            process.loadEnvFile(fullPath);
          } catch {}
        }
        // Fallback manual parser to guarantee variables exist
        const content = fs.readFileSync(fullPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    } catch {}
  }
}

// Initial environment loading
loadEnvConfig();

// Local SLM Defaults (Ollama)
export const DEFAULT_OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "qwen2.5-coder:1.5b";

export const DEFAULT_OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";

// Cloud LLM Defaults (Google Gemini API via OpenAI-compatible endpoint)
export const DEFAULT_GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export const DEFAULT_GEMINI_BASE_URL =
  process.env.GEMINI_BASE_URL ||
  "https://generativelanguage.googleapis.com/v1beta/openai/";

export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash",
];

export function getGeminiApiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  );
}

export const CLOUD_TIER_CONFIG: TierConfig = {
  tier: 3,
  name: "Cloud Tier (Google Gemini LLM)",
  maxWordsPerScrape: 4000,
  maxSteps: 6,
  temperature: 0.2,
  maxTokens: 2048,
  targetModels: [
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-pro",
  ],
};

export const TIER_CONFIGS: Record<ModelTier, TierConfig> = {
  1: {
    tier: 1,
    name: "Tier 1 (Small: 1B – 3B)",
    maxWordsPerScrape: 1000,
    maxSteps: 3,
    temperature: 0.2,
    maxTokens: 500,
    targetModels: [
      "qwen2.5-coder:1.5b",
      "qwen2.5:1.5b",
      "qwen2.5:0.5b",
      "llama3.2:1b",
      "llama3.2:3b",
      "smollm2:1.7b",
    ],
  },
  2: {
    tier: 2,
    name: "Tier 2 (Medium: 7B – 14B)",
    maxWordsPerScrape: 2500,
    maxSteps: 5,
    temperature: 0.3,
    maxTokens: 1000,
    targetModels: [
      "qwen2.5:7b",
      "qwen2.5-coder:7b",
      "qwen2.5:14b",
      "llama3.1:8b",
      "gemma2:9b",
      "mistral:7b",
    ],
  },
  3: {
    tier: 3,
    name: "Tier 3 (Large: 32B – 70B+)",
    maxWordsPerScrape: 5000,
    maxSteps: 8,
    temperature: 0.5,
    maxTokens: 2000,
    targetModels: [
      "qwen2.5:32b",
      "qwen2.5:72b",
      "llama3.3:70b",
      "deepseek-r1:32b",
      "deepseek-r1:70b",
      "command-r:35b",
    ],
  },
};

/**
 * Automatically determine the model tier based on parameter size hints in model name
 */
export function getModelTier(modelName: string): ModelTier {
  const normalized = (modelName || "").toLowerCase().trim();

  if (normalized.includes("gemini")) {
    return 3;
  }

  // Explicit check for large 32B+ models
  if (/(32b|33b|34b|70b|72b|deepseek-r1:32|deepseek-r1:70)/.test(normalized)) {
    return 3;
  }

  // Explicit check for medium 7B - 14B models
  if (/(7b|8b|9b|11b|12b|13b|14b)/.test(normalized)) {
    return 2;
  }

  // Explicit check for small 0.5B - 3B models
  if (/(0\.5b|1b|1\.5b|1\.7b|2b|3b|3\.2b)/.test(normalized)) {
    return 1;
  }

  // Fallback check against known target lists
  for (const tierKey of [3, 2, 1] as ModelTier[]) {
    if (
      TIER_CONFIGS[tierKey].targetModels.some((m) =>
        normalized.includes(m.toLowerCase())
      )
    ) {
      return tierKey;
    }
  }

  return 1;
}

/**
 * Retrieve active configuration for a given model
 */
export function getTierConfig(modelName: string, mode?: AgentMode): TierConfig {
  if (mode === "llm" || (modelName && modelName.toLowerCase().includes("gemini"))) {
    return CLOUD_TIER_CONFIG;
  }
  const tier = getModelTier(modelName);
  return TIER_CONFIGS[tier];
}

export interface ResolvedAgentConfig {
  mode: AgentMode;
  model: string;
  baseUrl: string;
  apiKey: string;
  tierConfig: TierConfig;
  fallbackModels: string[];
}

/**
 * Resolve full agent configuration based on runtime options and environment
 */
export function resolveAgentConfig(options?: Partial<AgentOptions>): ResolvedAgentConfig {
  loadEnvConfig();

  const geminiApiKey = getGeminiApiKey();

  // Determine mode
  let mode: AgentMode;
  if (options?.mode === "llm" || options?.mode === "local") {
    mode = options.mode;
  } else if (options?.model && options.model.toLowerCase().includes("gemini")) {
    mode = "llm";
  } else if (process.env.AGENT_MODE === "local") {
    mode = "local";
  } else if (process.env.AGENT_MODE === "llm") {
    mode = "llm";
  } else if (geminiApiKey) {
    // Default to Google Gemini API when API key is found in environment / .env.local
    mode = "llm";
  } else {
    mode = "local";
  }

  if (mode === "llm") {
    const model = options?.model || DEFAULT_GEMINI_MODEL;
    const baseUrl = options?.baseUrl || DEFAULT_GEMINI_BASE_URL;
    const apiKey = options?.apiKey || geminiApiKey || "";
    const tierConfig = CLOUD_TIER_CONFIG;
    const fallbackModels = GEMINI_FALLBACK_MODELS.filter((m) => m !== model);

    return {
      mode,
      model,
      baseUrl,
      apiKey,
      tierConfig,
      fallbackModels,
    };
  }

  // Local Ollama mode
  const model = options?.model || DEFAULT_OLLAMA_MODEL;
  const baseUrl = options?.baseUrl || DEFAULT_OLLAMA_BASE_URL;
  const apiKey = options?.apiKey || "ollama";
  const tierConfig = getTierConfig(model, "local");

  return {
    mode,
    model,
    baseUrl,
    apiKey,
    tierConfig,
    fallbackModels: [],
  };
}
