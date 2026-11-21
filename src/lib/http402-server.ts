// src/lib/http402-server.ts
/**
 * Server-Side HTTP 402 Paywall Middleware (Two-Sided Merchant / Web App Receiver)
 *
 * Enables Web Apps, Next.js App Router endpoints, and REST APIs to monetize requests
 * from autonomous AI agents over Bitcoin-native HTTP 402:
 * 1. Cashu NUT-24 (`X-Cashu: creqA...` challenge -> Fail-Closed Mint swap/claim + proof replay protection)
 * 2. Lightning L402 (`WWW-Authenticate: L402 macaroon="...", invoice="..."` -> HMAC-SHA256 & SHA256(preimage) check)
 *
 * Strictly Fail-Closed: any invalid, expired, underpaid, tampered, or replayed credential
 * is rejected with HTTP 402 before the wrapped handler ever executes.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Wallet } from "@cashu/cashu-ts";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  hexToBytes,
} from "./cbor";
import {
  DEFAULT_CASHU_MINT,
  encodeCashuToken,
  parseCashuToken,
} from "./cashu";
import { encodeCashu402Request } from "./http402";
import { makeNWCInvoice } from "./nwc";

export interface ServerPaymentReceipt {
  rail: "cashu_402" | "l402";
  amountSats: number;
  mintUrl?: string;
  claimedToken?: string;
  paymentHash?: string;
  preimage?: string;
  paidAt: number;
  resource: string;
}

export interface Http402PaywallConfig {
  /** Required payment amount in satoshis (> 0) */
  amountSats: number;
  /** Cashu Mint URLs accepted by this endpoint (defaults to [DEFAULT_CASHU_MINT]) */
  acceptedMints?: string[];
  /** Unit for Cashu payment requests (default: "sat") */
  unit?: string;
  /** Human-readable payment description embedded in the 402 challenge */
  description?: string;
  /** Enable Cashu NUT-24 X-Cashu challenge & verification (default: true) */
  enableCashu?: boolean;
  /** Enable Lightning L402 challenge & verification (default: false unless nwcUri or customInvoiceCreator is set) */
  enableL402?: boolean;
  /** NWC URI used to generate real BOLT-11 invoices when L402 is active */
  nwcUri?: string;
  /** HMAC-SHA256 signing secret for L402 macaroons (falls back to L402_MACAROON_SECRET env or random ephemeral secret) */
  macaroonSecret?: string;
  /** Validity lifetime of issued L402 macaroons in seconds (default: 600) */
  macaroonTtlSeconds?: number;
  /** Cashu claiming strategy: "swap" claims fresh proofs from the Mint; "verify_only" checks spent state directly */
  claimCashuMode?: "swap" | "verify_only";
  /** Optional custom verifier/claimer override (useful for offline tests) */
  customCashuVerifier?: (
    token: string,
    expectedSats: number,
    acceptedMints: string[]
  ) => Promise<{
    valid: boolean;
    claimedToken?: string;
    mintUrl?: string;
    amountSats?: number;
    reason?: string;
  }>;
  /** Optional custom Lightning invoice generator override (useful for offline tests or LND/CoreLN backends) */
  customInvoiceCreator?: (
    amountSats: number,
    description?: string
  ) => Promise<{ invoice: string; paymentHash: string }>;
  /** Optional hook invoked immediately after cryptographic payment verification succeeds */
  onPaymentReceived?: (receipt: ServerPaymentReceipt) => void | Promise<void>;
}

export interface L402MacaroonPayload {
  paymentHash: string;
  amountSats: number;
  expiresAt: number;
  resource: string;
}

export interface L402VerificationResult {
  valid: boolean;
  paymentHash?: string;
  preimage?: string;
  amountSats?: number;
  reason?: string;
}

// In-memory anti-replay registries preventing single-use eCash proof or L402 preimage reuse
const redeemedProofSecrets = new Set<string>();
const redeemedPaymentHashes = new Set<string>();

let ephemeralMacaroonSecret: string | null = null;

/**
 * Clears in-memory replay protection sets (intended strictly for deterministic test suites).
 */
export function resetServerReplayCacheForTests(): void {
  redeemedProofSecrets.clear();
  redeemedPaymentHashes.clear();
}

function resolveMacaroonSecret(configSecret?: string): string {
  if (configSecret && configSecret.trim().length > 0) {
    return configSecret.trim();
  }
  const envSecret = process.env.L402_MACAROON_SECRET?.trim();
  if (envSecret && envSecret.length > 0) {
    return envSecret;
  }
  if (!ephemeralMacaroonSecret) {
    ephemeralMacaroonSecret = randomBytes(32).toString("hex");
  }
  return ephemeralMacaroonSecret;
}

function normalizeMintUrl(mintUrl: string): string {
  return mintUrl.trim().replace(/\/+$/, "").toLowerCase();
}

function extractResourcePath(requestUrl: string): string {
  try {
    const parsed = new URL(requestUrl);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return requestUrl || "/";
  }
}

function constantTimeHexEqual(aHex: string, bHex: string): boolean {
  const cleanA = aHex.trim().toLowerCase();
  const cleanB = bHex.trim().toLowerCase();
  if (cleanA.length === 0 || cleanA.length !== cleanB.length || cleanA.length % 2 !== 0) {
    return false;
  }
  try {
    const bufA = hexToBytes(cleanA);
    const bufB = hexToBytes(cleanB);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Creates a signed L402 macaroon token encoded as `<base64url(payload)>.<base64url(hmac_sha256)>`.
 */
export function createL402Macaroon(
  payload: L402MacaroonPayload,
  secret: string
): string {
  if (!secret || !secret.trim()) {
    throw new Error("Cannot create L402 macaroon with empty secret.");
  }

  const normalizedPayload: L402MacaroonPayload = {
    paymentHash: payload.paymentHash.trim().toLowerCase(),
    amountSats: payload.amountSats,
    expiresAt: payload.expiresAt,
    resource: payload.resource,
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(normalizedPayload));
  const payloadB64 = bytesToBase64Url(payloadBytes);
  const signature = createHmac("sha256", secret).update(payloadB64).digest();
  const sigB64 = bytesToBase64Url(new Uint8Array(signature));

  return `${payloadB64}.${sigB64}`;
}

/**
 * Cryptographically verifies an `Authorization: L402 <macaroon>:<preimage>` (or LSAT) credential.
 * Validates constant-time HMAC-SHA256 signature, expiration, amount sufficiency, and
 * `SHA256(preimage) === paymentHash`.
 */
export function verifyL402Credential(
  authHeader: string,
  secret: string,
  expectedAmountSats: number
): L402VerificationResult {
  if (!authHeader || typeof authHeader !== "string") {
    return { valid: false, reason: "Missing Authorization header." };
  }
  if (!secret || !secret.trim()) {
    return { valid: false, reason: "Missing server macaroon secret." };
  }

  const match = authHeader.trim().match(/^(?:L402|LSAT)\s+([^:\s]+):([^\s]+)$/i);
  if (!match) {
    return { valid: false, reason: "Malformed L402 Authorization header format." };
  }

  const macaroon = match[1];
  const preimageHex = match[2];

  const parts = macaroon.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: "Malformed L402 macaroon structure." };
  }

  const [payloadB64, sigB64] = parts;

  try {
    // 1. Constant-time HMAC-SHA256 verification against macaroon payload
    const expectedSigBytes = new Uint8Array(
      createHmac("sha256", secret).update(payloadB64).digest()
    );
    const providedSigBytes = base64UrlToBytes(sigB64);

    if (
      providedSigBytes.length !== expectedSigBytes.length ||
      !timingSafeEqual(providedSigBytes, expectedSigBytes)
    ) {
      return { valid: false, reason: "Invalid L402 macaroon HMAC signature." };
    }

    // 2. Decode and inspect macaroon claims
    const payloadJson = new TextDecoder("utf-8").decode(base64UrlToBytes(payloadB64));
    const payload = JSON.parse(payloadJson) as Partial<L402MacaroonPayload>;

    if (
      !payload ||
      typeof payload.paymentHash !== "string" ||
      typeof payload.amountSats !== "number" ||
      typeof payload.expiresAt !== "number"
    ) {
      return { valid: false, reason: "Incomplete L402 macaroon claims." };
    }

    // 3. Enforce expiration window
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) {
      return { valid: false, reason: "L402 macaroon has expired." };
    }

    // 4. Enforce satoshi payment amount
    if (!Number.isFinite(payload.amountSats) || payload.amountSats < expectedAmountSats) {
      return {
        valid: false,
        reason: `L402 macaroon amount (${payload.amountSats} sats) is less than required ${expectedAmountSats} sats.`,
      };
    }

    // 5. Verify mathematical preimage linkage: SHA256(preimage) === paymentHash
    const preimageBytes = hexToBytes(preimageHex);
    if (preimageBytes.length === 0) {
      return { valid: false, reason: "Empty L402 preimage." };
    }

    const computedPaymentHash = createHash("sha256")
      .update(preimageBytes)
      .digest("hex")
      .toLowerCase();

    if (!constantTimeHexEqual(computedPaymentHash, payload.paymentHash)) {
      return {
        valid: false,
        reason: "L402 preimage SHA-256 hash does not match invoice paymentHash.",
      };
    }

    return {
      valid: true,
      paymentHash: computedPaymentHash,
      preimage: preimageHex.trim().toLowerCase(),
      amountSats: payload.amountSats,
    };
  } catch (err: any) {
    return {
      valid: false,
      reason: `L402 credential verification failed: ${err?.message || String(err)}`,
    };
  }
}

async function verifyOrSwapCashuAtMint(
  tokenString: string,
  expectedSats: number,
  mintUrl: string,
  unit: string,
  proofs: any[],
  mode: "swap" | "verify_only"
): Promise<{ claimedToken: string; amountSats: number }> {
  const cleanMint = mintUrl.trim().replace(/\/+$/, "");
  const wallet = new Wallet(cleanMint, { unit });
  await wallet.loadMint();

  if (mode === "verify_only") {
    let spentStates: any[] = [];
    if (typeof (wallet as any).checkProofStates === "function") {
      spentStates = await (wallet as any).checkProofStates(proofs);
    } else if (typeof (wallet as any).checkProofsSpent === "function") {
      spentStates = await (wallet as any).checkProofsSpent(proofs);
    } else if (typeof (wallet as any).checkProofsState === "function") {
      spentStates = await (wallet as any).checkProofsState(proofs);
    } else {
      throw new Error("Mint wallet does not support proof state verification.");
    }

    if (!Array.isArray(spentStates) || spentStates.length === 0) {
      throw new Error("Mint proof state check returned empty result.");
    }

    const hasSpent = spentStates.some(
      (s: any) => s === true || s?.state === "SPENT" || s?.spent === true
    );
    if (hasSpent) {
      throw new Error("Cashu token proofs are already spent at the Mint.");
    }

    const total = proofs.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
    if (total < expectedSats) {
      throw new Error(`Cashu token amount (${total} sats) is below required ${expectedSats} sats.`);
    }

    return { claimedToken: tokenString, amountSats: total };
  }

  // Default "swap" mode: atomically claim fresh proofs owned exclusively by this server
  const newProofs = await wallet.receive(tokenString);
  if (!Array.isArray(newProofs) || newProofs.length === 0) {
    throw new Error("Cashu Mint swap did not return claimed proofs.");
  }

  const receivedSats = newProofs.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  if (receivedSats < expectedSats) {
    throw new Error(
      `Claimed Mint proofs (${receivedSats} sats) are below required ${expectedSats} sats.`
    );
  }

  const claimedToken = encodeCashuToken(cleanMint, newProofs as any, unit);
  return { claimedToken, amountSats: receivedSats };
}

async function buildChallenge402Response(
  config: Http402PaywallConfig,
  acceptedMints: string[],
  resource: string,
  failureReason?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cashu",
    "Access-Control-Expose-Headers": "X-Cashu, WWW-Authenticate, X-NostrPulse-Receipt",
  };

  const unit = config.unit || "sat";
  const cashuEnabled = config.enableCashu !== false;
  const l402Enabled =
    Boolean(config.enableL402) ||
    Boolean(config.customInvoiceCreator) ||
    Boolean(config.nwcUri);

  if (cashuEnabled) {
    headers["X-Cashu"] = encodeCashu402Request({
      amountSats: config.amountSats,
      unit,
      mints: acceptedMints,
      description: config.description,
    });
  }

  let l402InvoiceError: string | undefined;
  if (l402Enabled) {
    try {
      let invoice = "";
      let paymentHash = "";

      if (config.customInvoiceCreator) {
        const created = await config.customInvoiceCreator(
          config.amountSats,
          config.description
        );
        invoice = created.invoice;
        paymentHash = created.paymentHash;
      } else if (config.nwcUri) {
        const nwcInvoice = await makeNWCInvoice({
          amountMsat: config.amountSats * 1000,
          description: config.description,
          nwcUri: config.nwcUri,
        });
        if (nwcInvoice.status === "success" && nwcInvoice.invoice && nwcInvoice.paymentHash) {
          invoice = nwcInvoice.invoice;
          paymentHash = nwcInvoice.paymentHash;
        } else {
          l402InvoiceError = nwcInvoice.error || "Failed to generate NWC Lightning invoice.";
        }
      }

      if (invoice && paymentHash) {
        const ttlMs = (config.macaroonTtlSeconds ?? 600) * 1000;
        const secret = resolveMacaroonSecret(config.macaroonSecret);
        const macaroon = createL402Macaroon(
          {
            paymentHash,
            amountSats: config.amountSats,
            expiresAt: Date.now() + ttlMs,
            resource,
          },
          secret
        );
        headers["WWW-Authenticate"] = `L402 macaroon="${macaroon}", invoice="${invoice}"`;
      }
    } catch (err: any) {
      l402InvoiceError = err?.message || String(err);
    }
  }

  return new Response(
    JSON.stringify(
      {
        error: failureReason || "Payment Required",
        amountSats: config.amountSats,
        unit,
        acceptedMints: cashuEnabled ? acceptedMints : [],
        description: config.description,
        l402Enabled,
        ...(l402InvoiceError ? { l402Notice: l402InvoiceError } : {}),
        instructions:
          "Retry with a Cashu token in the X-Cashu header (NUT-24) or an L402 credential in the Authorization header.",
      },
      null,
      2
    ),
    { status: 402, headers }
  );
}

/**
 * Verifies incoming HTTP 402 payment headers (`X-Cashu` or `Authorization: L402 ...`)
 * in strict Fail-Closed mode, returning either an authorized payment receipt or a
 * ready-to-send `402 Payment Required` Response with challenge headers.
 */
export async function verifyOrChallenge402(
  request: Request,
  config: Http402PaywallConfig
): Promise<
  | { authorized: true; receipt: ServerPaymentReceipt }
  | { authorized: false; response: Response }
> {
  if (!Number.isFinite(config.amountSats) || config.amountSats <= 0) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Invalid paywall configuration: amountSats must be > 0." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  const acceptedMints =
    config.acceptedMints && config.acceptedMints.length > 0
      ? config.acceptedMints.map((m) => m.trim().replace(/\/+$/, "")).filter(Boolean)
      : [DEFAULT_CASHU_MINT];
  const acceptedMintSet = new Set(acceptedMints.map(normalizeMintUrl));
  const resource = extractResourcePath(request.url);
  const unit = config.unit || "sat";

  const cashuEnabled = config.enableCashu !== false;
  const l402Enabled =
    Boolean(config.enableL402) ||
    Boolean(config.customInvoiceCreator) ||
    Boolean(config.nwcUri);

  const xCashuHeader = request.headers.get("x-cashu")?.trim();
  const authHeader = request.headers.get("authorization")?.trim();
  let failureReason: string | undefined;

  // 1. Evaluate Cashu NUT-24 (X-Cashu header)
  if (cashuEnabled && xCashuHeader) {
    try {
      const decoded = parseCashuToken(xCashuHeader);
      if (!decoded.proofs || decoded.proofs.length === 0) {
        throw new Error("Cashu token contains no valid proofs.");
      }

      if (decoded.totalAmountSats < config.amountSats) {
        throw new Error(
          `Insufficient Cashu payment: received ${decoded.totalAmountSats} sats, required ${config.amountSats} sats.`
        );
      }

      const cleanTokenMint = decoded.mint.trim().replace(/\/+$/, "");
      if (!acceptedMintSet.has(normalizeMintUrl(cleanTokenMint))) {
        throw new Error(
          `Unaccepted Cashu Mint "${cleanTokenMint}". Accepted mints: ${acceptedMints.join(", ")}`
        );
      }

      // Check every proof secret against local replay cache and internal duplicates
      const tokenSecrets = new Set<string>();
      for (const proof of decoded.proofs) {
        if (!proof.secret || typeof proof.secret !== "string") {
          throw new Error("Cashu token proof is missing a valid secret.");
        }
        if (redeemedProofSecrets.has(proof.secret) || tokenSecrets.has(proof.secret)) {
          throw new Error("Replay attack blocked: Cashu proof secret has already been redeemed.");
        }
        tokenSecrets.add(proof.secret);
      }

      let claimedToken: string | undefined;
      let settledMintUrl = cleanTokenMint;
      let settledAmountSats = decoded.totalAmountSats;

      if (config.customCashuVerifier) {
        const verification = await config.customCashuVerifier(
          xCashuHeader,
          config.amountSats,
          acceptedMints
        );
        if (!verification.valid) {
          throw new Error(verification.reason || "Custom Cashu verifier rejected token.");
        }
        claimedToken = verification.claimedToken ?? xCashuHeader;
        if (verification.mintUrl) {
          settledMintUrl = verification.mintUrl.trim().replace(/\/+$/, "");
        }
        if (typeof verification.amountSats === "number" && verification.amountSats > 0) {
          settledAmountSats = verification.amountSats;
        }
      } else {
        const swapMode = config.claimCashuMode ?? "swap";
        const mintResult = await verifyOrSwapCashuAtMint(
          xCashuHeader,
          config.amountSats,
          cleanTokenMint,
          decoded.unit || unit,
          decoded.proofs,
          swapMode
        );
        claimedToken = mintResult.claimedToken;
        settledAmountSats = mintResult.amountSats;
      }

      // Record proof secrets only after cryptographic claim/verification succeeded
      for (const secret of tokenSecrets) {
        redeemedProofSecrets.add(secret);
      }

      const receipt: ServerPaymentReceipt = {
        rail: "cashu_402",
        amountSats: settledAmountSats,
        mintUrl: settledMintUrl,
        claimedToken,
        paidAt: Date.now(),
        resource,
      };

      if (config.onPaymentReceived) {
        await config.onPaymentReceived(receipt);
      }

      return { authorized: true, receipt };
    } catch (err: any) {
      failureReason = err?.message || String(err);
    }
  }

  // 2. Evaluate Lightning L402 (Authorization: L402 <macaroon>:<preimage>)
  if (l402Enabled && authHeader && /^(?:L402|LSAT)\s+/i.test(authHeader)) {
    const secret = resolveMacaroonSecret(config.macaroonSecret);
    const l402Result = verifyL402Credential(authHeader, secret, config.amountSats);

    if (l402Result.valid && l402Result.paymentHash) {
      if (redeemedPaymentHashes.has(l402Result.paymentHash)) {
        failureReason =
          "Replay attack blocked: L402 paymentHash has already been redeemed.";
      } else {
        redeemedPaymentHashes.add(l402Result.paymentHash);

        const receipt: ServerPaymentReceipt = {
          rail: "l402",
          amountSats: l402Result.amountSats || config.amountSats,
          paymentHash: l402Result.paymentHash,
          preimage: l402Result.preimage,
          paidAt: Date.now(),
          resource,
        };

        if (config.onPaymentReceived) {
          await config.onPaymentReceived(receipt);
        }

        return { authorized: true, receipt };
      }
    } else {
      failureReason = l402Result.reason || "Invalid L402 credential.";
    }
  } else if (!xCashuHeader && authHeader && /^(?:L402|LSAT)\s+/i.test(authHeader) && !l402Enabled) {
    failureReason = "L402 payment rail is not enabled on this endpoint.";
  }

  // 3. Fail-Closed: return HTTP 402 Payment Required challenge
  const response = await buildChallenge402Response(
    config,
    acceptedMints,
    resource,
    failureReason
  );
  return { authorized: false, response };
}

/**
 * Wraps a Web Standard or Next.js App Router route handler with a Bitcoin HTTP 402 paywall.
 * Automatically appends the `X-NostrPulse-Receipt` response header upon settlement.
 */
export function withHttp402Paywall<TContext = unknown>(
  handler: (
    req: Request,
    context: TContext,
    receipt: ServerPaymentReceipt
  ) => Promise<Response> | Response,
  config: Http402PaywallConfig
): (req: Request, context?: TContext) => Promise<Response> {
  return async (req: Request, context: TContext = undefined as TContext): Promise<Response> => {
    const verification = await verifyOrChallenge402(req, config);
    if (!verification.authorized) {
      return verification.response;
    }

    const innerResponse = await handler(req, context, verification.receipt);
    const mergedHeaders = new Headers(innerResponse.headers);
    mergedHeaders.set(
      "X-NostrPulse-Receipt",
      JSON.stringify({
        rail: verification.receipt.rail,
        amountSats: verification.receipt.amountSats,
        mintUrl: verification.receipt.mintUrl,
        paymentHash: verification.receipt.paymentHash,
        paidAt: verification.receipt.paidAt,
        resource: verification.receipt.resource,
      })
    );

    const existingExpose = mergedHeaders.get("Access-Control-Expose-Headers");
    if (existingExpose) {
      if (!existingExpose.toLowerCase().includes("x-nostrpulse-receipt")) {
        mergedHeaders.set(
          "Access-Control-Expose-Headers",
          `${existingExpose}, X-NostrPulse-Receipt`
        );
      }
    } else {
      mergedHeaders.set("Access-Control-Expose-Headers", "X-NostrPulse-Receipt");
    }

    return new Response(innerResponse.body, {
      status: innerResponse.status,
      statusText: innerResponse.statusText,
      headers: mergedHeaders,
    });
  };
}
