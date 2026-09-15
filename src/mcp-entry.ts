#!/usr/bin/env node
/**
 * src/mcp-entry.ts
 *
 * NostrPulse Model Context Protocol (MCP) Server Entry Point
 * Implements standard stdio JSON-RPC transport for AI clients
 * (Claude Desktop, Cursor, LangChain, autonomous agents).
 *
 * Exposes core capabilities:
 * 1. check_trust_score: Anti-Sybil Trust Score & Web-of-Trust graph metrics.
 * 2. pay_cashu_nutzap: Value-4-Value NIP-61 Cashu NutZap eCash payments.
 * 3. request_nip90_job: Distributed NIP-90 DVM computation with local fallback.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { normalizePubkey, encodeNpub, getWebOfTrustDistance } from "./lib/wot";
import { calculateTrustScore } from "./lib/trust-score";
import {
  initDatabase,
  getCreatorFromDb,
  getZapTotalsFromDb,
  accumulateZapTotals,
  recordZapEdge,
} from "./lib/db";
import {
  sendCashuNutZap,
  createCashuMintQuote,
  DEFAULT_CASHU_MINT,
  parseCashuToken,
} from "./lib/cashu";
import { requestDvmAnalyticsWithFallback } from "./lib/dvm";
import { globalToolRegistry } from "./lib/tool-registry";

// Auto-load environment variables if available
try {
  process.loadEnvFile?.(".env.local");
} catch {
  try {
    process.loadEnvFile?.(".env");
  } catch {}
}

/**
 * Initialize the NostrPulse MCP Server
 */
const mcpServer = new McpServer({
  name: "nostrpulse-mcp-server",
  version: "1.0.0",
});

// =============================================================================
// Tool 1: check_trust_score
// =============================================================================
mcpServer.tool(
  "check_trust_score",
  "Calculate Nostr Web-of-Trust (WoT) distance, Economic Stake (Zap satoshis), and anti-Sybil Trust Score (0-100) for any Nostr identity.",
  {
    pubkey: z
      .string()
      .describe(
        "Nostr public key in 64-char lowercase hex or bech32 npub format (e.g. 'npub1...', '3bf0c63fc...')"
      ),
  },
  async ({ pubkey }) => {
    try {
      await initDatabase();
      const hex = normalizePubkey(pubkey);

      if (!hex) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Invalid public key format. Expected 64-char hex or bech32 npub.",
                  input: pubkey,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const npub = encodeNpub(hex);

      // Query graph distance and database
      const wotResult = getWebOfTrustDistance(hex);
      const [creatorDb, zapRow] = await Promise.all([
        getCreatorFromDb(hex),
        getZapTotalsFromDb(hex),
      ]);

      const verifiedZapsSats = zapRow?.valid_sender_sats ?? 0;
      const totalZapsSats = zapRow?.total_sats ?? 0;
      const sybilFilteredSats = Math.max(0, totalZapsSats - verifiedZapsSats);

      let score = creatorDb ? creatorDb.score : 0;
      let tier: "Verified Builder" | "Active Contributor" | "Unverified / Potential Bot" =
        "Unverified / Potential Bot";

      if (creatorDb) {
        score = creatorDb.score;
        if (wotResult.distance === 0 || (score >= 80 && wotResult.distance <= 1)) {
          tier = "Verified Builder";
        } else if (score >= 50 && wotResult.distance <= 2) {
          tier = "Active Contributor";
        } else {
          tier = "Unverified / Potential Bot";
        }
      } else {
        const calculated = calculateTrustScore(
          { pubkey: hex, npub, name: "" },
          undefined,
          wotResult
        );
        score = calculated.score;
        tier = calculated.tier;
      }

      const payload = {
        pubkey: hex,
        npub,
        name: creatorDb?.name || undefined,
        score: Math.round(score),
        tier,
        wot: {
          direct_anchor_endorsed:
            wotResult.distance === 0 ||
            (wotResult.distance === 1 && wotResult.endorsedByCount > 0),
          distance: wotResult.distance,
          endorsers_count: wotResult.endorsedByCount,
          endorsers: wotResult.endorsers,
          sybil_risk: wotResult.sybilRisk,
        },
        economic_stake: {
          verified_zaps_sats: verifiedZapsSats,
          sybil_filtered_sats: sybilFilteredSats,
        },
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error calculating trust score: ${err?.message || String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 2: pay_cashu_nutzap
// =============================================================================
mcpServer.tool(
  "pay_cashu_nutzap",
  "Send a Cashu eCash NutZap (NIP-61 Kind 9321 via NIP-44 encryption) to a Nostr recipient pubkey using Cashu eCash tokens or request a mint invoice.",
  {
    recipient: z
      .string()
      .describe("Recipient Nostr public key (64-char hex or bech32 npub)"),
    amountSats: z
      .number()
      .int()
      .min(1)
      .describe("Amount in satoshis to pay"),
    cashuToken: z
      .string()
      .optional()
      .describe(
        "Optional Cashu eCash token string (cashuA... or cashuB...). If omitted, generates a Lightning invoice to mint proofs"
      ),
    mintUrl: z
      .string()
      .optional()
      .describe("Target Cashu Mint URL (default: https://testnut.cashu.space)"),
    comment: z
      .string()
      .optional()
      .describe("Optional payment message or memo to include in the NutZap"),
  },
  async ({ recipient, amountSats, cashuToken, mintUrl, comment }) => {
    try {
      await initDatabase();
      const hexRecipient = normalizePubkey(recipient);

      if (!hexRecipient) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: "Invalid recipient public key format.", recipient },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const cleanMint = (mintUrl || DEFAULT_CASHU_MINT).trim();

      // Case A: A pre-funded Cashu token was provided -> Execute NutZap immediately
      if (cashuToken && cashuToken.trim()) {
        const parsedToken = parseCashuToken(cashuToken.trim());

        if (parsedToken.totalAmountSats < amountSats) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: `Insufficient token balance. Token has ${parsedToken.totalAmountSats} sats, but ${amountSats} sats required.`,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const zapResult = await sendCashuNutZap({
          recipientPubkey: hexRecipient,
          cashuToken: cashuToken.trim(),
          amountSats,
          comment: comment || "Value-4-Value eCash NutZap 🥜⚡",
          mintUrl: cleanMint,
        });

        // Record zap in local database
        await Promise.allSettled([
          accumulateZapTotals({
            pubkey: hexRecipient,
            addTotalSats: amountSats,
            addValidSats: amountSats,
          }),
          recordZapEdge("mcp_agent_sender", hexRecipient, amountSats),
        ]);

        const responseData = {
          success: true,
          status: "settled",
          kind: 9321,
          eventId: zapResult.id,
          amountSats,
          recipient: hexRecipient,
          changeToken: zapResult.changeToken,
          message: `Successfully delivered ${amountSats.toLocaleString()} Sats NutZap to ${hexRecipient}!`,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(responseData, null, 2),
            },
          ],
        };
      }

      // Case B: No token provided -> Request Lightning Mint Quote
      const quote = await createCashuMintQuote(amountSats, cleanMint);

      const quoteData = {
        success: true,
        status: "payment_required",
        quoteId: quote.quoteId,
        invoice: quote.invoice,
        amountSats,
        mintUrl: quote.mintUrl,
        recipient: hexRecipient,
        message: `Lightning invoice generated. Pay ${amountSats} sats to mint proofs and complete NutZap.`,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(quoteData, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error processing NutZap payment: ${err?.message || String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 3: request_nip90_job
// =============================================================================
mcpServer.tool(
  "request_nip90_job",
  "Dispatch a distributed NIP-90 Data Vending Machine (DVM) job request (Kind 5000/5300) across Nostr relays for analytics/reputation computation, with automatic fallback to local database.",
  {
    prompt: z
      .string()
      .describe("Target Nostr public key (hex or npub) or computation input query"),
    category: z
      .string()
      .optional()
      .describe(
        "Task category: 'zap-analytics', 'reputation', or 'trust-score' (default: 'trust-score')"
      ),
    timeframe: z
      .string()
      .optional()
      .describe("Historical timeframe: 'all-time', '1y', or '30d' (default: 'all-time')"),
    bidSats: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Bid fee offered to DVM worker in satoshis (default: 5)"),
    timeoutMs: z
      .number()
      .int()
      .min(500)
      .max(10000)
      .optional()
      .describe("Timeout in milliseconds before falling back to local database (default: 3500)"),
  },
  async ({ prompt, category, timeframe, bidSats, timeoutMs }) => {
    try {
      const hex = normalizePubkey(prompt) || prompt;

      const result = await requestDvmAnalyticsWithFallback({
        targetPubkey: hex,
        category: (category as any) || "trust-score",
        timeframe: (timeframe as any) || "all-time",
        bidSats: bidSats ?? 5,
        timeoutMs: timeoutMs ?? 3500,
      });

      const responsePayload = {
        pubkey: result.pubkey,
        totalSats: result.totalSats,
        validSenderSats: result.validSenderSats,
        zapCount: result.zapCount,
        trustScore: result.trustScore,
        reputationTier: result.reputationTier,
        source: result.source,
        dvmFallback: result.dvmFallback,
        dvmPubkey: result.dvmPubkey || undefined,
        jobId: result.jobId || undefined,
        latencyMs: result.latencyMs,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(responsePayload, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error processing NIP-90 DVM request: ${err?.message || String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Register tools into globalToolRegistry as well for interoperability
globalToolRegistry.registerToMcpServer(mcpServer);

/**
 * Connect to standard stdio JSON-RPC transport
 */
async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("[NostrPulse MCP] StdioServerTransport connected. Server running on stdio JSON-RPC.");
}

main().catch((error) => {
  console.error("[NostrPulse MCP] Fatal error starting MCP server:", error);
  process.exit(1);
});
