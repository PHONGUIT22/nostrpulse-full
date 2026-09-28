// src/agent/types.ts
/**
 * Types & Schema Definitions for Universal Local AI Web Browsing Agent
 */

import type OpenAI from "openai";

export type ModelTier = 1 | 2 | 3;
export type AgentMode = "local" | "llm";

export interface TierConfig {
  tier: ModelTier;
  name: string;
  maxWordsPerScrape: number;
  maxSteps: number;
  temperature: number;
  maxTokens: number;
  targetModels: string[];
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ScrapeResult {
  url: string;
  content: string;
  wordCount: number;
  title?: string;
}

export interface AgentStepEvent {
  step: number;
  maxSteps: number;
  type: "thinking" | "tool_call" | "tool_result" | "synthesizing" | "completed" | "error";
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResultSnippet?: string;
  message?: string;
}

export interface AgentOptions {
  mode?: AgentMode;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  maxSteps?: number;
  temperature?: number;
  onStep?: (event: AgentStepEvent) => void;
}

export interface AgentRunResult {
  answer: string;
  sources: string[];
  steps: AgentStepEvent[];
  modelUsed: string;
  mode: AgentMode;
  tier: ModelTier;
  totalSteps: number;
  latencyMs: number;
}

/**
 * OpenAI-compatible Tool Definitions for Web Agent
 */
export const AGENT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the live web using DuckDuckGo to find relevant article URLs and snippets.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query keywords to look up on the web.",
          },
          limit: {
            type: "number",
            description: "Maximum number of search results to return (default: 5).",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_page",
      description: "Fetch and extract clean Markdown content from a specific web page URL.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full HTTP/HTTPS URL of the web page to scrape and read.",
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
];
