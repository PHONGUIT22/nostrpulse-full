// scripts/test-mini-agent.ts
try {
  process.loadEnvFile?.(".env.local");
} catch {}

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import OpenAI from "openai";
import path from "path";

// 1. Configure Gemini via Google AI Studio's OpenAI-compatible endpoint
const gemini = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY || "AIzaSy...",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

// Candidate models to fallback if one experiences high demand
const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
].filter(Boolean) as string[];

async function callGeminiWithFallback(
  params: Omit<OpenAI.ChatCompletionCreateParamsNonStreaming, "model">
): Promise<{ response: OpenAI.ChatCompletion; modelUsed: string }> {
  let lastError: unknown;
  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await gemini.chat.completions.create({
        ...params,
        model,
      });
      return { response, modelUsed: model };
    } catch (err: any) {
      lastError = err;
      console.error(`[Warning] Model ${model} failed (${err?.status || err?.message}). Attempting fallback...`);
    }
  }
  throw lastError;
}

async function main() {
  console.error(">>> [1] Starting MCP Stdio Client...");

  const mcpEntryPath = path.resolve(process.cwd(), "src/mcp-entry.ts");
  const transport = new StdioClientTransport({
    command: process.platform === "win32" ? "cmd.exe" : "npx",
    args:
      process.platform === "win32"
        ? ["/c", "npx.cmd", "tsx", mcpEntryPath]
        : ["tsx", mcpEntryPath],
  });

  const mcpClient = new Client(
    { name: "gemini-agent-tester", version: "1.0.0" },
    { capabilities: {} }
  );

  await mcpClient.connect(transport);
  console.error(">>> [2] Connected to MCP Server!");

  // 2. Discover tools from MCP Server and convert to OpenAI function calling format
  const { tools } = await mcpClient.listTools();
  console.error(`>>> [3] Discovered ${tools.length} tool(s):`, tools.map((t) => t.name));

  const geminiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || "",
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));

  // 3. User instruction: Inspect Web-of-Trust reputation
  const prompt =
    "Please check the Web-of-Trust reputation for pubkey fiatjaf: 3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
  console.error(`\n>>> [4] Sending prompt to Gemini: "${prompt}"`);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are an autonomous AI agent. Automatically call the appropriate tool to fulfill user requests.",
    },
    { role: "user", content: prompt },
  ];

  // 4. Initial Gemini call to plan tool execution
  const { response, modelUsed } = await callGeminiWithFallback({
    messages,
    tools: geminiTools,
    tool_choice: "auto",
  });

  const choice = response.choices[0];
  const toolCalls = choice.message.tool_calls;

  // 5. Execute requested tools via MCP Client
  if (toolCalls && toolCalls.length > 0) {
    messages.push(choice.message);

    for (const call of toolCalls) {
      if (call.type !== "function") continue;

      const toolName = call.function.name;
      const toolArgs = JSON.parse(call.function.arguments);
      console.error(`\n>>> [5] Gemini requested tool call: ${toolName}`);
      console.error("        Arguments:", toolArgs);

      const toolResult = await mcpClient.callTool({
        name: toolName,
        arguments: toolArgs,
      });

      console.error(">>> [6] MCP Server response:", JSON.stringify(toolResult, null, 2));

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }

    // 6. Gemini processes tool execution results and synthesizes final answer
    console.error(`\n>>> [7] Awaiting Gemini final answer synthesis using ${modelUsed}...\n`);
    const { response: finalResponse } = await callGeminiWithFallback({
      messages,
    });

    console.log("================ GEMINI AGENT RESPONSE ================");
    console.log(finalResponse.choices[0].message.content);
    console.log("========================================================");
  } else {
    console.log("Gemini did not invoke any tools:", choice.message.content);
  }

  await transport.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});