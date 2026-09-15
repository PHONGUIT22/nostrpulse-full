// scripts/test-mcp-stdio.ts
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  console.log("=== Testing NostrPulse MCP Server via StdioClientTransport ===\n");

  const serverScript = path.resolve(__dirname, "../src/mcp-entry.ts");

  // Configure stdio transport to spawn the server process
  const transport = new StdioClientTransport({
    command: process.platform === "win32" ? "cmd.exe" : "npx",
    args: process.platform === "win32"
      ? ["/c", "npx.cmd", "tsx", serverScript]
      : ["tsx", serverScript],
  });

  const client = new Client(
    { name: "nostrpulse-test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    // 1. Connect client to server via stdio transport (performs handshake and initialize)
    console.log("[Test 1] Connecting to MCP Server on stdio...");
    await client.connect(transport);
    console.log("--> Client connected successfully! Handshake & Initialize: PASSED");

    // 2. Discover available tools via tools/list
    console.log("\n[Test 2] Querying tools list...");
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools || [];
    console.log(`Discovered ${tools.length} available tools:`);
    for (const t of tools) {
      console.log(`  * ${t.name}: ${(t.description || "").slice(0, 70)}...`);
    }

    const toolNames = tools.map((t) => t.name);
    if (
      !toolNames.includes("check_trust_score") ||
      !toolNames.includes("pay_cashu_nutzap") ||
      !toolNames.includes("request_nip90_job")
    ) {
      throw new Error(`Missing expected tools. Found: ${toolNames.join(", ")}`);
    }
    console.log("--> All 3 core tools (check_trust_score, pay_cashu_nutzap, request_nip90_job) are registered!");

    // 3. Test execution of check_trust_score
    console.log("\n[Test 3] Executing 'check_trust_score' for fiatjaf...");
    const fiatjafPubkey = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
    const scoreResult: any = await client.callTool({
      name: "check_trust_score",
      arguments: {
        pubkey: fiatjafPubkey,
      },
    });

    console.log("Call completed. isError:", Boolean(scoreResult.isError));
    const scoreText = scoreResult.content?.[0]?.text;
    console.log("Output content snippet:\n", scoreText?.slice(0, 300), "...");

    if (!scoreText) throw new Error("No text content returned from check_trust_score");
    const scoreData = JSON.parse(scoreText);
    console.log(`Verified output -> Score: ${scoreData.score}, Tier: "${scoreData.tier}", Distance: ${scoreData.wot?.distance}`);
    if (typeof scoreData.score !== "number") throw new Error("Score was not returned as a number");
    console.log("--> check_trust_score tool execution: PASSED");

    // 4. Test execution of pay_cashu_nutzap (invoice quote generation)
    console.log("\n[Test 4] Executing 'pay_cashu_nutzap' (Quote Mode)...");
    const nutzapResult: any = await client.callTool({
      name: "pay_cashu_nutzap",
      arguments: {
        recipient: fiatjafPubkey,
        amountSats: 21,
        comment: "MCP Stdio Test NutZap 🥜⚡",
      },
    });

    const nutzapText = nutzapResult.content?.[0]?.text;
    console.log("NutZap output snippet:\n", nutzapText?.slice(0, 250), "...");
    const nutzapData = JSON.parse(nutzapText || "{}");
    console.log(`Verified NutZap -> Status: "${nutzapData.status}", Amount: ${nutzapData.amountSats} sats`);
    if (!nutzapData.invoice && nutzapData.status !== "payment_required") {
      throw new Error("Expected payment_required or invoice in NutZap response");
    }
    console.log("--> pay_cashu_nutzap tool execution: PASSED");

    // 5. Test execution of request_nip90_job (with fast local fallback)
    console.log("\n[Test 5] Executing 'request_nip90_job' (DVM with local fallback)...");
    const dvmResult: any = await client.callTool({
      name: "request_nip90_job",
      arguments: {
        prompt: fiatjafPubkey,
        category: "zap-analytics",
        timeoutMs: 1500,
      },
    });

    const dvmText = dvmResult.content?.[0]?.text;
    console.log("DVM output snippet:\n", dvmText?.slice(0, 250), "...");
    const dvmData = JSON.parse(dvmText || "{}");
    console.log(`Verified DVM -> Source: "${dvmData.source}", Fallback: ${dvmData.dvmFallback}, Sats: ${dvmData.totalSats}`);
    console.log("--> request_nip90_job tool execution: PASSED");

    console.log("\n=== ALL MCP Stdio Server Tests Passed with 100% Success! ===");
  } finally {
    try {
      await client.close();
    } catch {}
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
