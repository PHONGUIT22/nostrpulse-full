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
 * 4. pay_lightning_nwc: Direct Lightning Network payment via NIP-47 Nostr Wallet Connect.
 * 5. audit_cashu_mint: NUT-06 health and 5-Pillar Trust Score audit for Cashu Mints.
 * 6. route_cashu_mint: WoT-Gated Dynamic Mint Mesh routing.
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
import { payWithNWC } from "./lib/nwc";
import { auditCashuMint, routeCashuMint } from "./lib/mint-mesh";
import { getOrInitAgentIdentity, getAgentPubkey } from "./lib/identity-manager";
import { checkSpendingAllowed, recordAgentSpending, getSpendingSummary } from "./lib/spending-guardrails";
import { assertSpendingAllowed, getSpendingPolicy, getRolling24hSpend } from "./lib/guardrails";
import {
  logTelemetryEvent,
  getTelemetryOverview,
  queryTelemetryEvents,
  logAgentEvent,
  getAgentTelemetrySummary,
} from "./lib/telemetry";
import { decodeBolt11AmountSats } from "./lib/indexer";


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

      await logTelemetryEvent({
        eventType: "radar.trust_score.checked",
        category: "radar",
        status: "success",
        targetPubkey: hex,
        metadata: { score: payload.score, tier: payload.tier, distance: payload.wot.distance },
      });

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

      let cleanMint = mintUrl?.trim();
      if (!cleanMint) {
        try {
          const routeRes = await routeCashuMint({ amountSats });
          if (routeRes.meshHealthy && routeRes.selectedMint?.mintUrl) {
            cleanMint = routeRes.selectedMint.mintUrl;
          }
        } catch {}
      }
      cleanMint = (cleanMint || DEFAULT_CASHU_MINT).trim();

      // Guardrails Check: Enforce daily allowance, single-tx cap, and recipient trust score
      const guardrail = await assertSpendingAllowed({
        amountSats,
        recipientPubkey: hexRecipient,
        rail: "nutzap",
      });

      if (!guardrail.allowed) {
        await logAgentEvent({
          type: "radar_block",
          data: {
            amountSats,
            recipient: hexRecipient,
            rail: "nutzap",
            reason: guardrail.reason,
          },
        });

        await logTelemetryEvent({
          eventType: "payment.guardrail_blocked",
          category: "payment",
          status: "blocked",
          targetPubkey: hexRecipient,
          amountSats,
          metadata: { rail: "nutzap", reason: guardrail.reason },
          error: guardrail.reason,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  status: "blocked_by_guardrails",
                  reason: guardrail.reason,
                },
                null,
                2
              ),
            },
          ],
        };
      }

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

        // Record spending in guardrails tracker and audit telemetry
        await Promise.allSettled([
          recordAgentSpending({
            amountSats,
            rail: "cashu",
            recipientPubkey: hexRecipient,
            eventId: zapResult.id,
            memo: comment,
          }),
          logAgentEvent({
            type: "payment",
            data: {
              amountSats,
              rail: "nutzap",
              recipient: hexRecipient,
              mint: cleanMint,
              eventId: zapResult.id,
              status: "settled",
            },
          }),
          accumulateZapTotals({
            pubkey: hexRecipient,
            addTotalSats: amountSats,
            addValidSats: amountSats,
          }),
          recordZapEdge("mcp_agent_sender", hexRecipient, amountSats),
          logTelemetryEvent({
            eventType: "payment.nutzap.settled",
            category: "payment",
            status: "success",
            targetPubkey: hexRecipient,
            amountSats,
            metadata: { eventId: zapResult.id, mintUrl: cleanMint },
          }),
        ]);

        const current24h = await getRolling24hSpend();
        const policy = getSpendingPolicy();

        const responseData = {
          success: true,
          status: "settled",
          kind: 9321,
          eventId: zapResult.id,
          amountSats,
          recipient: hexRecipient,
          changeToken: zapResult.changeToken,
          guardrail: {
            remainingDailySats: Math.max(0, policy.dailyLimitSats - current24h),
          },
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

// =============================================================================
// Tool 4: pay_lightning_nwc (NIP-47 Direct Lightning Rail)
// =============================================================================
const nwcToolHandler = async ({ invoice, nwcUri, timeoutMs, amountMsat }: {
  invoice: string;
  nwcUri?: string;
  timeoutMs?: number;
  amountMsat?: number;
}) => {
  try {
    const amountSats =
      amountMsat && amountMsat > 0
        ? Math.round(amountMsat / 1000)
        : decodeBolt11AmountSats(invoice) || 1;

    // Guardrails Check: Enforce daily allowance and per-transaction limits for NWC
    const guardrail = await assertSpendingAllowed({
      amountSats,
      rail: "nwc",
    });

    if (!guardrail.allowed) {
      await logAgentEvent({
        type: "radar_block",
        data: {
          amountSats,
          rail: "nwc",
          invoice,
          reason: guardrail.reason,
        },
      });

      await logTelemetryEvent({
        eventType: "payment.guardrail_blocked",
        category: "payment",
        status: "blocked",
        amountSats,
        metadata: { rail: "nwc", reason: guardrail.reason },
        error: guardrail.reason,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "blocked_by_guardrails",
                reason: guardrail.reason,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const result = await payWithNWC({
      invoice,
      nwcUri,
      timeoutMs: timeoutMs ?? 15000,
      amountMsat,
    });

    if (result.status === "success") {
      // Record spending and log telemetry
      await Promise.allSettled([
        recordAgentSpending({
          amountSats,
          rail: "lightning_nwc",
          eventId: result.responseEventId,
          memo: `Lightning NWC Payment (Preimage: ${result.preimage?.slice(0, 10)}...)`,
        }),
        logAgentEvent({
          type: "payment",
          data: {
            amountSats,
            rail: "nwc",
            invoice,
            preimage: result.preimage,
            feesPaidSats: result.fees_paid,
            responseEventId: result.responseEventId,
            status: "settled",
          },
        }),
        logTelemetryEvent({
          eventType: "payment.nwc.settled",
          category: "payment",
          status: "success",
          amountSats,
          metadata: { preimage: result.preimage, feesPaid: result.fees_paid },
        }),
      ]);

      const current24h = await getRolling24hSpend();
      const policy = getSpendingPolicy();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                status: "settled",
                preimage: result.preimage,
                feesPaidSats: result.fees_paid,
                responseEventId: result.responseEventId,
                guardrail: {
                  remainingDailySats: Math.max(0, policy.dailyLimitSats - current24h),
                },
                message: `Lightning payment settled successfully via NWC! Preimage: ${result.preimage}`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    await logTelemetryEvent({
      eventType: "payment.nwc.failed",
      category: "payment",
      status: "failed",
      amountSats,
      error: result.error,
      metadata: { errorCode: result.errorCode },
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: false,
              status: result.status,
              error: result.error,
              errorCode: result.errorCode,
              responseEventId: result.responseEventId,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error executing NWC payment: ${err?.message || String(err)}`,
        },
      ],
      isError: true,
    };
  }
};

const nwcToolSchema = {
  invoice: z
    .string()
    .describe("BOLT-11 Lightning invoice."),
  nwcUri: z
    .string()
    .optional()
    .describe(
      "Explicit NWC connection URI (falls back to env NWC_CONNECTION_URI)."
    ),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(60000)
    .optional()
    .describe("Timeout in milliseconds (default: 15000)"),
  amountMsat: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Optional amount in millisatoshis for amountless invoices"),
};

mcpServer.tool(
  "pay_lightning_nwc",
  "Settle BOLT-11 Lightning invoices directly through an autonomous node via NIP-47 Nostr Wallet Connect (Alby Hub, Phoenixd, Umbrel).",
  nwcToolSchema,
  nwcToolHandler
);

mcpServer.tool(
  "pay_with_nwc",
  "Alias for pay_lightning_nwc: settle BOLT-11 Lightning invoices via NIP-47 NWC.",
  nwcToolSchema,
  nwcToolHandler
);

// =============================================================================
// Tool 5: audit_cashu_mint
// =============================================================================
mcpServer.tool(
  "audit_cashu_mint",
  "Audit and evaluate counterparty risk of a Cashu eCash Mint using Web-of-Trust graph distance, NIP-05 sovereign domain validation, and admin reputation.",
  {
    mintUrl: z
      .string()
      .describe("Target Cashu mint URL (e.g., https://mint.minibits.cash/Bitcoin)."),
    forceRefresh: z
      .boolean()
      .optional()
      .describe("Bypass in-memory audit cache and perform fresh live probe (default: false)"),
  },
  async ({ mintUrl, forceRefresh }) => {
    try {
      await initDatabase();
      const audit = await auditCashuMint(mintUrl, forceRefresh ?? false);

      await logTelemetryEvent({
        eventType: "mint.audited",
        category: "mint",
        status: audit.isOnline ? "success" : "failed",
        metadata: { mintUrl, trustScore: audit.trustScore, riskLevel: audit.riskLevel },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(audit, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error auditing Cashu Mint: ${err?.message || String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 6: route_cashu_mint
// =============================================================================
mcpServer.tool(
  "route_cashu_mint",
  "Dynamically discover and route to the highest-trust, lowest-latency Cashu Mint from the WoT-Gated Dynamic Mint Mesh.",
  {
    amountSats: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Intended payment or minting amount in Satoshis"),
    preferredMint: z
      .string()
      .optional()
      .describe("Optional preferred mint URL to prioritize if verified and healthy"),
    minTrustScore: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe("Minimum WoT Trust Score required to pass the security gate (default: 45)"),
  },
  async ({ amountSats, preferredMint, minTrustScore }) => {
    try {
      await initDatabase();
      const routing = await routeCashuMint({
        amountSats,
        preferredMint,
        minTrustScore: minTrustScore ?? 45,
      });

      await logTelemetryEvent({
        eventType: "mint.routed",
        category: "mint",
        status: routing.meshHealthy ? "success" : "failed",
        amountSats,
        metadata: { selectedMint: routing.selectedMint?.mintUrl },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(routing, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error routing Cashu Mint: ${err?.message || String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 7: get_agent_identity (Zero-Config Identity Bootstrapping)
// =============================================================================
mcpServer.tool(
  "get_agent_identity",
  "Retrieve active autonomous AI agent cryptographic public identity (pubkey, npub, identity source, and ephemeral status).",
  {},
  async () => {
    try {
      const identity = getOrInitAgentIdentity();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                pubkey: identity.pubkey,
                npub: identity.npub,
                source: identity.source,
                isEphemeral: identity.isEphemeral,
                createdAt: identity.createdAt,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error resolving agent identity: ${err?.message || String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 8: get_spending_guardrails (Agent Budget & Limits Inspector)
// =============================================================================
mcpServer.tool(
  "get_spending_guardrails",
  "Query current AI agent spending guardrails, daily budget, 24-hour satoshis spent, remaining allowance, and per-transaction limits.",
  {},
  async () => {
    try {
      await initDatabase();
      const summary = await getSpendingSummary();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error inspecting spending guardrails: ${err?.message || String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 9: get_agent_telemetry (Developer Observability & Audit Trail)
// =============================================================================
mcpServer.tool(
  "get_agent_telemetry",
  "Inspect autonomous agent spending metrics, rolling 24h budget allowance, blocked Sybil threats, and recent telemetry events.",
  {
    timeframeHours: z
      .number()
      .int()
      .min(1)
      .max(720)
      .optional()
      .describe("Rolling window in hours to inspect (default: 24)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of telemetry events to retrieve (default: 20)"),
  },
  async ({ timeframeHours, limit }) => {
    try {
      await initDatabase();
      const hours = timeframeHours ?? 24;
      const policy = getSpendingPolicy();
      const spentTodaySats = await getRolling24hSpend();
      const remainingSats = Math.max(0, policy.dailyLimitSats - spentTodaySats);

      const summary = await getAgentTelemetrySummary(hours);
      const overview = await getTelemetryOverview();
      const events = await queryTelemetryEvents({ limit: limit ?? 20 });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                dailyLimitSats: policy.dailyLimitSats,
                spentTodaySats,
                remainingSats,
                totalSpentSats: summary.totalSpentSats,
                txCount: summary.txCount,
                blockedSybilAttacks: summary.blockedSybilAttacks,
                recentEvents: summary.recentEvents.slice(0, limit ?? 20),
                events,
                overview: {
                  totalVolumeSats: overview.totalVolumeSats,
                  totalEvents: overview.totalEvents,
                  successRatePercent: overview.successRatePercent,
                  byCategory: overview.byCategory,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error retrieving agent telemetry: ${err?.message || String(err)}`,
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
