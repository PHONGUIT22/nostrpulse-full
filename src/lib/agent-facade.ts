// src/lib/agent-facade.ts
/**
 * Unified Agent Wallet Facade (NostrPulseAgent)
 *
 * Consolidates Nostr Identity, Web-of-Trust Anti-Sybil Radar, Spending Guardrails,
 * Stateful Multi-Mint Cashu Vault, NIP-59/NIP-61 NutZaps, and Lightning NWC into a
 * developer-friendly 3-line interface.
 */

import { initDatabase } from "./db";
import { getOrInitAgentIdentity, type AgentIdentity } from "./identity-manager";
import {
  getSpendingPolicy,
  updateSpendingPolicy,
  assertSpendingAllowed,
  getRolling24hSpend,
  resolveRecipientTrustScore,
  type SpendingPolicy,
} from "./guardrails";
import {
  depositCashuToken,
  getAgentWalletBalance,
  withdrawOrSplitProofsForPayment,
} from "./wallet-vault";
import {
  normalizePubkey,
  encodeNpub,
  resolveWebOfTrustDistance,
} from "./wot";
import { isRootAnchor } from "./anchors";
import {
  encodeCashuToken,
  parseCashuToken,
  sendCashuNutZap,
  DEFAULT_CASHU_MINT,
} from "./cashu";
import { payWithNWC } from "./nwc";
import { recordAgentSpending } from "./spending-guardrails";
import { logTelemetryEvent, logAgentEvent } from "./telemetry";

export interface AgentWalletConfig {
  /** Maximum satoshis allowed in a single transaction */
  maxSingleTxSats?: number;
  /** Maximum cumulative satoshis spendable within a rolling 24-hour window */
  maxDailySats?: number;
  /** Minimum recipient Trust Score (0-100) required to approve outgoing payments (default: 50) */
  minTrustScore?: number;
  /** Preferred Cashu Mint URL for eCash operations */
  preferredMintUrl?: string;
  /** Whether to permit interacting with unverified Cashu mints */
  allowUnverifiedMints?: boolean;
}

export interface AgentWalletStatus {
  agentPubkey: string;
  agentNpub: string;
  totalBalanceSats: number;
  mints: Array<{ mintUrl: string; balanceSats: number; count: number }>;
  policy: {
    maxSingleTxSats: number;
    maxDailySats: number;
    minTrustScore: number;
    rolling24hSpendSats: number;
    remainingDailyBudgetSats: number;
  };
}

export interface AgentPeerVerification {
  pubkey: string;
  npub: string;
  trustScore: number;
  wotDistance: number;
  isRootAnchor: boolean;
  allowedToPay: boolean;
}

export interface AgentPayParams {
  /** Recipient Nostr public key (64-char hex or bech32 npub) */
  to: string;
  /** Payment amount in satoshis */
  amountSats: number;
  /** Optional payment memo or comment */
  memo?: string;
  /** Optional external Cashu token string; if omitted, funds are drawn from the local vault */
  cashuToken?: string;
  /** Optional BOLT-11 Lightning invoice; if provided, settles via NIP-47 NWC */
  bolt11Invoice?: string;
  /** If true, executes guardrails and vault withdrawal/split without broadcasting to Nostr relays */
  dryRun?: boolean;
}

export interface AgentPayReceipt {
  success: boolean;
  status: "settled" | "blocked_by_guardrails" | "failed";
  rail?: "cashu_nutzap" | "lightning_nwc";
  txId?: string;
  amountSats: number;
  recipient: string;
  mintUrl?: string;
  remainingBalanceSats?: number;
  remainingDailyBudgetSats?: number;
  reason?: string;
}

/**
 * High-level unified facade class encapsulating identity, anti-Sybil verification,
 * budget guardrails, stateful Cashu vault operations, and Nostr/Lightning settlement.
 */
export class NostrPulseAgent {
  private readonly config: AgentWalletConfig;
  private initialized = false;
  private identity: AgentIdentity | null = null;
  private policy: SpendingPolicy;

  constructor(config: AgentWalletConfig = {}) {
    this.config = { ...config };
    const basePolicy = getSpendingPolicy();
    this.policy = {
      maxSatsPerTx: config.maxSingleTxSats ?? basePolicy.maxSatsPerTx,
      dailyLimitSats: config.maxDailySats ?? basePolicy.dailyLimitSats,
      minTrustScoreTarget: config.minTrustScore ?? 50,
    };
  }

  /**
   * Initializes local SQLite storage, agent Nostr identity, and active spending policy.
   */
  public async init(): Promise<void> {
    if (!this.initialized) {
      await initDatabase();
      this.identity = await getOrInitAgentIdentity();
      this.initialized = true;
    }

    // Apply instance spending policy so assertSpendingAllowed uses configured limits
    updateSpendingPolicy(this.policy);
  }

  /**
   * Returns current agent identity, multi-mint eCash balances, and budget utilization.
   */
  public async getBalance(): Promise<AgentWalletStatus> {
    await this.init();
    const identity = this.identity || (await getOrInitAgentIdentity());
    const [walletBalance, rolling24hSpendSats] = await Promise.all([
      getAgentWalletBalance(),
      getRolling24hSpend(),
    ]);

    const remainingDailyBudgetSats = Math.max(
      0,
      this.policy.dailyLimitSats - rolling24hSpendSats
    );

    return {
      agentPubkey: identity.pubkey,
      agentNpub: identity.npub,
      totalBalanceSats: walletBalance.totalBalanceSats,
      mints: walletBalance.mints,
      policy: {
        maxSingleTxSats: this.policy.maxSatsPerTx,
        maxDailySats: this.policy.dailyLimitSats,
        minTrustScore: this.policy.minTrustScoreTarget,
        rolling24hSpendSats,
        remainingDailyBudgetSats,
      },
    };
  }

  /**
   * Deposits an incoming Cashu eCash token into the agent's local stateful vault.
   */
  public async deposit(
    cashuToken: string,
    options?: { skipRemoteVerify?: boolean }
  ): Promise<{ depositedSats: number; mintUrl: string; newTotalBalance: number }> {
    await this.init();
    return await depositCashuToken(cashuToken, {
      skipMintVerification: options?.skipRemoteVerify,
    });
  }

  /**
   * Evaluates a recipient pubkey/npub against the 5-Pillar Web-of-Trust anti-Sybil radar.
   */
  public async verifyPeer(pubkeyOrNpub: string): Promise<AgentPeerVerification> {
    await this.init();
    const hex = normalizePubkey(pubkeyOrNpub);
    if (!hex) {
      throw new Error(`Invalid Nostr pubkey or npub: "${pubkeyOrNpub}"`);
    }

    const npub = encodeNpub(hex);
    const [wot, trustScore] = await Promise.all([
      resolveWebOfTrustDistance(hex, { timeoutMs: 2500 }),
      resolveRecipientTrustScore(hex),
    ]);

    const anchor = isRootAnchor(hex) || wot.isDirectAnchor;
    const allowedToPay = trustScore >= this.policy.minTrustScoreTarget;

    return {
      pubkey: hex,
      npub,
      trustScore,
      wotDistance: wot.distance,
      isRootAnchor: anchor,
      allowedToPay,
    };
  }

  /**
   * Executes an autonomous agent payment through the 5-stage pipeline:
   * Identity/DB -> WoT & Guardrails Firewall -> Auto-Vault & Split / NWC -> Settlement -> Telemetry.
   */
  public async pay(params: AgentPayParams): Promise<AgentPayReceipt> {
    // Step A: Identity & DB bootstrap + recipient normalization
    await this.init();
    const hexRecipient = normalizePubkey(params.to);
    if (!hexRecipient) {
      return {
        success: false,
        status: "failed",
        amountSats: params.amountSats,
        recipient: params.to,
        reason: `Invalid recipient Nostr pubkey or npub: "${params.to}"`,
      };
    }

    const railType: "nutzap" | "nwc" = params.bolt11Invoice ? "nwc" : "nutzap";
    const receiptRail: "cashu_nutzap" | "lightning_nwc" = params.bolt11Invoice
      ? "lightning_nwc"
      : "cashu_nutzap";

    // Step B: Firewall — Spending Guardrails & Anti-Sybil Trust Score check
    const guardrail = await assertSpendingAllowed({
      amountSats: params.amountSats,
      recipientPubkey: hexRecipient,
      rail: railType,
    });

    if (!guardrail.allowed) {
      await Promise.allSettled([
        logAgentEvent({
          type: "radar_block",
          data: {
            amountSats: params.amountSats,
            recipient: hexRecipient,
            rail: receiptRail,
            reason: guardrail.reason,
          },
        }),
        logTelemetryEvent({
          eventType: "payment.guardrail_blocked",
          category: "payment",
          status: "blocked",
          targetPubkey: hexRecipient,
          amountSats: params.amountSats,
          metadata: { rail: receiptRail, reason: guardrail.reason },
          error: guardrail.reason,
        }),
      ]);

      return {
        success: false,
        status: "blocked_by_guardrails",
        rail: receiptRail,
        amountSats: params.amountSats,
        recipient: hexRecipient,
        reason: guardrail.reason,
      };
    }

    try {
      let txId = "";
      let mintUrl: string | undefined;

      // Step C & D: Routing, Auto-Vault Splitting, and Settlement
      if (params.bolt11Invoice) {
        if (params.dryRun) {
          txId = `dryrun_nwc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        } else {
          const nwcResult = await payWithNWC({ invoice: params.bolt11Invoice });
          if (nwcResult.status !== "success") {
            return {
              success: false,
              status: "failed",
              rail: "lightning_nwc",
              amountSats: params.amountSats,
              recipient: hexRecipient,
              reason: nwcResult.error || `NWC payment ${nwcResult.status}`,
            };
          }
          txId =
            nwcResult.preimage ||
            nwcResult.responseEventId ||
            `nwc_${Date.now()}`;
        }
      } else {
        let tokenToSend = params.cashuToken?.trim();
        mintUrl = this.config.preferredMintUrl || DEFAULT_CASHU_MINT;

        if (!tokenToSend) {
          const withdrawn = await withdrawOrSplitProofsForPayment(
            params.amountSats,
            this.config.preferredMintUrl
          );
          mintUrl = withdrawn.mintUrl;
          tokenToSend = encodeCashuToken(mintUrl, withdrawn.sendProofs);
        } else {
          const parsed = parseCashuToken(tokenToSend);
          if (parsed.totalAmountSats < params.amountSats) {
            return {
              success: false,
              status: "failed",
              rail: "cashu_nutzap",
              amountSats: params.amountSats,
              recipient: hexRecipient,
              reason: `Provided Cashu token balance (${parsed.totalAmountSats} sats) is less than requested ${params.amountSats} sats.`,
            };
          }
          mintUrl = parsed.mint || mintUrl;
        }

        if (params.dryRun) {
          txId = `dryrun_nutzap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        } else {
          const zapResult = await sendCashuNutZap({
            recipientPubkey: hexRecipient,
            cashuToken: tokenToSend,
            amountSats: params.amountSats,
            comment: params.memo || "Value-4-Value eCash NutZap",
            mintUrl,
            giftWrap: true,
          });
          txId = zapResult.giftWrapId || zapResult.id;
        }
      }

      // Step E: Accounting & Telemetry
      await Promise.allSettled([
        recordAgentSpending({
          amountSats: params.amountSats,
          rail: params.bolt11Invoice ? "lightning_nwc" : "cashu",
          recipientPubkey: hexRecipient,
          eventId: txId,
          memo: params.memo,
        }),
        logAgentEvent({
          type: "payment",
          data: {
            amountSats: params.amountSats,
            rail: receiptRail,
            recipient: hexRecipient,
            mint: mintUrl,
            txId,
            dryRun: Boolean(params.dryRun),
            status: "settled",
          },
        }),
        logTelemetryEvent({
          eventType: params.bolt11Invoice
            ? "payment.nwc.settled"
            : "payment.nutzap.settled",
          category: "payment",
          status: "success",
          targetPubkey: hexRecipient,
          amountSats: params.amountSats,
          metadata: {
            txId,
            mintUrl,
            dryRun: Boolean(params.dryRun),
          },
        }),
      ]);

      const [walletBalance, spent24h] = await Promise.all([
        getAgentWalletBalance(),
        getRolling24hSpend(),
      ]);

      return {
        success: true,
        status: "settled",
        rail: receiptRail,
        txId,
        amountSats: params.amountSats,
        recipient: hexRecipient,
        mintUrl,
        remainingBalanceSats: walletBalance.totalBalanceSats,
        remainingDailyBudgetSats: Math.max(0, this.policy.dailyLimitSats - spent24h),
      };
    } catch (err: any) {
      return {
        success: false,
        status: "failed",
        rail: receiptRail,
        amountSats: params.amountSats,
        recipient: hexRecipient,
        reason: err?.message || String(err),
      };
    }
  }
}

/**
 * Factory helper to instantiate a NostrPulseAgent wallet facade.
 */
export function createAgentWallet(config?: AgentWalletConfig): NostrPulseAgent {
  return new NostrPulseAgent(config);
}
