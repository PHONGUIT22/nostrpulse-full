// src/agent/orchestrator.ts
/**
 * Adaptive ReAct Orchestrator for Universal Local AI Web Browsing Agent
 * Supports open-weights models from 1B to 70B+ with dynamic guardrails and fault tolerance.
 */

import OpenAI from "openai";
import { performance } from "perf_hooks";
import {
  resolveAgentConfig,
  type ResolvedAgentConfig,
} from "./config";
import { getSystemPrompt } from "./prompts";
import { searchWeb } from "./tools/search";
import { scrapePage } from "./tools/scrape";
import {
  AGENT_TOOLS,
  type AgentOptions,
  type AgentRunResult,
  type AgentStepEvent,
} from "./types";

/**
 * Clean and parse JSON with fault-tolerance for small models
 */
function tryParseJson(str: string): any | null {
  if (!str || typeof str !== "string") return null;
  let cleaned = str.trim();
  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch {}

  // Strip markdown code fences if present
  cleaned = cleaned
    .replace(/^```(?:json|JSON)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  // Strip single-line & multi-line comments
  cleaned = cleaned.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  // Strip trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(cleaned);
  } catch {}

  // Fix single quotes
  try {
    const singleQuoteFixed = cleaned
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
      .replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(singleQuoteFixed);
  } catch {}

  return null;
}

/**
 * Extract raw JSON snippets from text, with priority to markdown code blocks
 */
function extractJsonSnippets(rawContent: string): { content: string; fromMarkdown: boolean }[] {
  const snippets: { content: string; fromMarkdown: boolean }[] = [];

  // 1. Markdown code blocks
  const markdownRegex = /```(?:json|JSON)?\s*([\s\S]*?)\s*```/g;
  let match: RegExpExecArray | null;
  while ((match = markdownRegex.exec(rawContent)) !== null) {
    const block = match[1]?.trim();
    if (block) {
      snippets.push({ content: block, fromMarkdown: true });
    }
  }

  // 1b. Unclosed markdown code block
  if (snippets.length === 0) {
    const unclosedMatch = rawContent.match(/```(?:json|JSON)?\s*([\s\S]*)$/i);
    if (unclosedMatch && unclosedMatch[1]?.trim()) {
      snippets.push({ content: unclosedMatch[1].trim(), fromMarkdown: true });
    }
  }

  // 2. Balanced brace scanner
  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < rawContent.length; i++) {
    const char = rawContent[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{" || char === "[") {
        if (depth === 0) startIndex = i;
        depth++;
      } else if (char === "}" || char === "]") {
        depth--;
        if (depth === 0 && startIndex !== -1) {
          const sub = rawContent.slice(startIndex, i + 1).trim();
          if (!snippets.some((s) => s.content === sub)) {
            snippets.push({ content: sub, fromMarkdown: false });
          }
          startIndex = -1;
        }
      }
    }
  }

  return snippets;
}

/**
 * Resolve tool name and arguments from parsed object for SLMs
 */
function resolveToolCallFromParsed(
  parsed: any,
  allowedTools: OpenAI.ChatCompletionTool[],
  contextText = ""
): { toolName: string; toolArgs: Record<string, any> } | null {
  if (!parsed || typeof parsed !== "object") return null;

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const res = resolveToolCallFromParsed(item, allowedTools, contextText);
      if (res) return res;
    }
    return null;
  }

  if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
    for (const item of parsed.tool_calls) {
      const res = resolveToolCallFromParsed(item, allowedTools, contextText);
      if (res) return res;
    }
  }

  let candidateName =
    parsed.name ||
    parsed.tool ||
    parsed.function ||
    parsed.action ||
    parsed.tool_name ||
    parsed.toolName;

  if (candidateName && typeof candidateName === "object") {
    candidateName = candidateName.name || candidateName.tool;
  }

  const rawArgs =
    parsed.arguments ??
    parsed.args ??
    parsed.parameters ??
    parsed.params ??
    parsed.action_input ??
    parsed.input;

  if (typeof candidateName === "string") {
    const matched = allowedTools.find(
      (t) => "function" in t && t.function.name === candidateName
    );
    if (matched && "function" in matched) {
      let argsObj: Record<string, any> = {};
      if (rawArgs !== undefined) {
        argsObj = typeof rawArgs === "string" ? tryParseJson(rawArgs) || {} : rawArgs;
      } else {
        argsObj = { ...parsed };
        delete argsObj.name;
        delete argsObj.tool;
        delete argsObj.function;
        delete argsObj.action;
      }
      return { toolName: matched.function.name, toolArgs: argsObj };
    }
  }

  // Schema matching fallback
  const parsedKeys = Object.keys(parsed);
  const lowerContext = contextText.toLowerCase();

  for (const tool of allowedTools) {
    if (!("function" in tool)) continue;
    const name = tool.function.name;
    if (lowerContext.includes(name.toLowerCase())) {
      return { toolName: name, toolArgs: rawArgs || parsed };
    }
  }

  if (parsedKeys.includes("query") || parsedKeys.includes("searchQuery")) {
    return { toolName: "search_web", toolArgs: rawArgs || parsed };
  }
  if (parsedKeys.includes("url") || parsedKeys.includes("link")) {
    return { toolName: "read_page", toolArgs: rawArgs || parsed };
  }

  return null;
}

/**
 * Parse JSON tool calls from SLM text responses when structured calls are omitted
 */
function parseJsonToolCalls(
  rawContent: string,
  allowedTools: OpenAI.ChatCompletionTool[],
  promptContext = ""
): Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> {
  const synthesizedCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];

  const snippets = extractJsonSnippets(rawContent);

  for (const { content } of snippets) {
    const parsed = tryParseJson(content);
    if (!parsed) continue;

    const resolved = resolveToolCallFromParsed(
      parsed,
      allowedTools,
      `${rawContent} ${promptContext}`
    );

    if (resolved) {
      synthesizedCalls.push({
        id: `call_${Math.random().toString(36).slice(2, 9)}`,
        type: "function",
        function: {
          name: resolved.toolName,
          arguments: JSON.stringify(resolved.toolArgs),
        },
      });
      break;
    }
  }

  return synthesizedCalls;
}

/**
 * Execute a recognized tool call and return formatted string output
 */
async function executeTool(
  toolName: string,
  toolArgs: Record<string, any>,
  maxWordsPerScrape: number,
  visitedUrls?: Set<string>
): Promise<{ resultText: string; sources: string[]; isDuplicate?: boolean }> {
  const sources: string[] = [];

  if (toolName === "search_web") {
    const query = String(toolArgs.query || toolArgs.q || "").trim();
    const limit = typeof toolArgs.limit === "number" ? toolArgs.limit : 5;

    if (!query) {
      return { resultText: "Error: No search query provided.", sources };
    }

    const results = await searchWeb(query, limit);
    if (results.length === 0) {
      return {
        resultText: `No search results found on DuckDuckGo for query: "${query}". Try alternative keywords.`,
        sources,
      };
    }

    for (const r of results) {
      if (r.url) sources.push(r.url);
    }

    const formatted = results
      .map(
        (r, idx) =>
          `[${idx + 1}] Title: ${r.title}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`
      )
      .join("\n\n");

    return {
      resultText: `Found ${results.length} search results for "${query}":\n\n${formatted}`,
      sources,
    };
  }

  if (toolName === "read_page") {
    const url = String(toolArgs.url || toolArgs.link || "").trim();
    if (!url) {
      return { resultText: "Error: No URL provided to read_page.", sources };
    }

    const normalized = url.replace(/\/+$/, "").toLowerCase();
    if (visitedUrls && visitedUrls.has(normalized)) {
      return {
        resultText: `[SYSTEM NOTICE]: You have ALREADY read this exact URL (${url}). Its full content is already provided above in the conversation. DO NOT call read_page again. Please synthesize and output your final answer directly to the user now.`,
        sources: [url],
        isDuplicate: true,
      };
    }
    if (visitedUrls) {
      visitedUrls.add(normalized);
    }

    sources.push(url);
    const scraped = await scrapePage(url, maxWordsPerScrape);

    return {
      resultText: `Extracted content from ${scraped.url} (${scraped.wordCount} words):\n\n${scraped.content}`,
      sources,
    };
  }

  return {
    resultText: `Error: Unknown tool '${toolName}'. Allowed tools are search_web, read_page.`,
    sources,
  };
}

/**
 * Main Agent Orchestrator: Runs an adaptive ReAct loop with guardrails
 */
/**
 * Remove adjacent duplicate sentences commonly produced by small models (< 3B)
 */
function cleanRepetitiveSentences(text: string): string {
  if (!text || text.length < 30) return text;

  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
  const result: string[] = [];
  let prevNormalized = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
    if (!normalized) continue;

    if (normalized === prevNormalized) {
      continue;
    }

    result.push(trimmed);
    prevNormalized = normalized;
  }

  return result.join(" ");
}

/**
 * Execute completion with automatic fallback for rate-limited models
 */
async function createCompletionWithFallback(
  client: OpenAI,
  params: OpenAI.ChatCompletionCreateParamsNonStreaming,
  fallbackModels: string[],
  onFallback?: (oldModel: string, newModel: string, reason: string) => void
): Promise<{ completion: OpenAI.ChatCompletion; activeModel: string }> {
  let currentModel = params.model;
  const modelsToTry = [
    currentModel,
    ...fallbackModels.filter((m) => m !== currentModel),
  ];

  let lastError: any;
  for (let i = 0; i < modelsToTry.length; i++) {
    const candidateModel = modelsToTry[i];
    try {
      const comp = await client.chat.completions.create({
        ...params,
        model: candidateModel,
      });
      return { completion: comp, activeModel: candidateModel };
    } catch (err: any) {
      lastError = err;
      const isQuotaOrLimit =
        err?.status === 429 ||
        err?.status === 404 ||
        err?.status === 503 ||
        (err?.message &&
          (err.message.includes("quota") ||
            err.message.includes("high demand") ||
            err.message.includes("RESOURCE_EXHAUSTED")));

      if (isQuotaOrLimit && i < modelsToTry.length - 1) {
        const nextModel = modelsToTry[i + 1];
        onFallback?.(
          candidateModel,
          nextModel,
          err?.message || "Quota/Rate limit encountered"
        );
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Main Agent Orchestrator: Runs an adaptive ReAct loop with guardrails
 * Supports both Local SLM (via Ollama) and Cloud LLM (via Google Gemini API)
 */
export async function runAgent(
  userQuery: string,
  options?: AgentOptions
): Promise<AgentRunResult> {
  const startTime = performance.now();
  const query = (userQuery || "").trim();
  if (!query) {
    throw new Error("Cannot run agent with an empty query.");
  }

  const resolved = resolveAgentConfig(options);
  if (resolved.mode === "llm" && !resolved.apiKey) {
    throw new Error(
      "Missing Google Gemini API key for LLM mode. Please add GEMINI_API_KEY to your .env.local file or pass apiKey in options."
    );
  }

  let activeModel = resolved.model;
  const tierConfig = resolved.tierConfig;
  const maxSteps = options?.maxSteps ?? tierConfig.maxSteps;
  const temperature = options?.temperature ?? tierConfig.temperature;

  const client = new OpenAI({
    apiKey: resolved.apiKey,
    baseURL: resolved.baseUrl,
    timeout: 35000,
  });

  const stepHistory: AgentStepEvent[] = [];
  const discoveredSources = new Set<string>();
  const visitedUrls = new Set<string>();
  let hasReadPage = false;

  const systemPrompt = getSystemPrompt(tierConfig.tier, {
    mode: resolved.mode,
  });
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ];

  let stepCount = 0;
  let finalAnswer = "";

  while (stepCount < maxSteps) {
    stepCount++;

    const thinkingEvent: AgentStepEvent = {
      step: stepCount,
      maxSteps,
      type: "thinking",
      message: `Step ${stepCount}/${maxSteps}: Reasoning with ${activeModel} (${tierConfig.name})...`,
    };
    stepHistory.push(thinkingEvent);
    options?.onStep?.(thinkingEvent);

    // For Tier 1 (1B - 3B), once read_page has retrieved webpage content,
    // do not offer tools again so the small model immediately synthesizes the answer.
    const shouldOfferTools =
      resolved.mode === "llm" || tierConfig.tier > 1 || !hasReadPage;

    if (!shouldOfferTools) {
      messages.push({
        role: "user",
        content: `Based on the webpage content read above, provide a direct, concise summary answering: "${query}". Write in the same language as the query (Vietnamese). Do NOT output tool calls or JSON.`,
      });
    }

    let completion: OpenAI.ChatCompletion;
    try {
      const completionParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        model: activeModel,
        messages,
        temperature,
        max_tokens: tierConfig.maxTokens,
      };

      if (shouldOfferTools) {
        completionParams.tools = AGENT_TOOLS;
        completionParams.tool_choice = "auto";
      }

      const res = await createCompletionWithFallback(
        client,
        completionParams,
        resolved.fallbackModels,
        (oldModel, newModel, reason) => {
          const fallbackEvent: AgentStepEvent = {
            step: stepCount,
            maxSteps,
            type: "thinking",
            message: `Quota limit on ${oldModel}. Switching to ${newModel}...`,
          };
          stepHistory.push(fallbackEvent);
          options?.onStep?.(fallbackEvent);
        }
      );

      completion = res.completion;
      activeModel = res.activeModel;
    } catch (err: any) {
      const errEvent: AgentStepEvent = {
        step: stepCount,
        maxSteps,
        type: "error",
        message: `LLM inference error: ${err?.message || String(err)}`,
      };
      stepHistory.push(errEvent);
      options?.onStep?.(errEvent);
      throw err;
    }

    const choice = completion.choices[0];
    let toolCalls = shouldOfferTools ? choice?.message?.tool_calls : undefined;

    // Small model fallback: check if tool call is inside message content only when tools are offered
    if (
      shouldOfferTools &&
      (!toolCalls || toolCalls.length === 0) &&
      choice?.message?.content
    ) {
      const rawContent = choice.message.content.trim();
      const synthesized = parseJsonToolCalls(rawContent, AGENT_TOOLS, query);
      if (synthesized.length > 0) {
        toolCalls = synthesized as any;
      }
    }

    // If tools were not offered (e.g. page already read for Tier 1), this turn's response is the final answer
    if (!shouldOfferTools) {
      const text = (choice?.message?.content || "").trim();
      if (!text.startsWith('{"name"') && !text.startsWith("```json")) {
        finalAnswer = text;
        break;
      }
    }

    // If the model produced tool calls and budget allows
    if (toolCalls && toolCalls.length > 0) {
      // Exactly 1:1 match assistant tool_calls with the tool responses we provide
      const assistantMessage: OpenAI.ChatCompletionMessageParam = {
        role: "assistant",
        content: choice.message.content || "",
        tool_calls: toolCalls as any,
      };
      messages.push(assistantMessage);

      for (const call of toolCalls) {
        if (!("function" in call) || !call.function) continue;

        const toolName = call.function.name;
        let toolArgs: Record<string, any> = {};
        try {
          toolArgs = JSON.parse(call.function.arguments || "{}");
        } catch {
          toolArgs = {};
        }

        const toolCallEvent: AgentStepEvent = {
          step: stepCount,
          maxSteps,
          type: "tool_call",
          toolName,
          toolArgs,
          message: `Invoking tool: ${toolName}`,
        };
        stepHistory.push(toolCallEvent);
        options?.onStep?.(toolCallEvent);

        let executionResult: {
          resultText: string;
          sources: string[];
          isDuplicate?: boolean;
        };
        try {
          executionResult = await executeTool(
            toolName,
            toolArgs,
            tierConfig.maxWordsPerScrape,
            visitedUrls
          );
        } catch (callErr: any) {
          executionResult = {
            resultText: `Tool execution failed: ${callErr?.message || String(callErr)}`,
            sources: [],
          };
        }

        if (toolName === "read_page") {
          hasReadPage = true;
        }

        for (const s of executionResult.sources) {
          discoveredSources.add(s);
        }

        const resultSnippet =
          executionResult.resultText.length > 200
            ? executionResult.resultText.slice(0, 200) + "..."
            : executionResult.resultText;

        const resultEvent: AgentStepEvent = {
          step: stepCount,
          maxSteps,
          type: "tool_result",
          toolName,
          toolResultSnippet: resultSnippet,
          message: `Tool result received (${executionResult.resultText.length} chars)`,
        };
        stepHistory.push(resultEvent);
        options?.onStep?.(resultEvent);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: executionResult.resultText,
        });
      }
    } else {
      // Model responded with text answer
      const content = (choice?.message?.content || "").trim();
      // If content is an unparsed raw code fence tool call, force synthesis instead of outputting raw code
      if (!content.startsWith("```json") && !content.startsWith('{"name":')) {
        finalAnswer = content;
        break;
      }
    }
  }

  // If max steps reached without final text answer, force synthesis
  if (!finalAnswer) {
    const synthEvent: AgentStepEvent = {
      step: stepCount,
      maxSteps,
      type: "synthesizing",
      message:
        "Max step budget reached. Synthesizing final answer from gathered evidence...",
    };
    stepHistory.push(synthEvent);
    options?.onStep?.(synthEvent);

    messages.push({
      role: "user",
      content:
        "Based on all the search results and web pages read above, please provide a concise, factual, and direct final answer with source links. Do not call any more tools.",
    });

    try {
      const finalCompletion = await client.chat.completions.create({
        model: activeModel,
        messages,
        temperature,
        max_tokens: tierConfig.maxTokens,
      });
      finalAnswer = (
        finalCompletion.choices[0]?.message?.content || ""
      ).trim();
    } catch (err: any) {
      finalAnswer = `Agent gathered web evidence but synthesis encountered an error: ${err?.message || String(err)}`;
    }
  }

  // Clean any adjacent duplicate sentences produced by small models
  finalAnswer = cleanRepetitiveSentences(finalAnswer);

  // Extract source links from final answer as well
  const urlRegex = /https?:\/\/[^\s)\]]+/g;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlRegex.exec(finalAnswer)) !== null) {
    discoveredSources.add(urlMatch[0]);
  }

  const latencyMs = Math.round(performance.now() - startTime);

  const completedEvent: AgentStepEvent = {
    step: stepCount,
    maxSteps,
    type: "completed",
    message: `Completed in ${stepCount} steps (${latencyMs}ms)`,
  };
  stepHistory.push(completedEvent);
  options?.onStep?.(completedEvent);

  return {
    answer: finalAnswer,
    sources: Array.from(discoveredSources),
    steps: stepHistory,
    modelUsed: activeModel,
    mode: resolved.mode,
    tier: tierConfig.tier,
    totalSteps: stepCount,
    latencyMs,
  };
}
