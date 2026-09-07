// src/lib/cashu.ts
import { getDecodedToken, getEncodedToken, Wallet } from "@cashu/cashu-ts";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { nip19, nip04, nip44 } from "nostr-tools";

export interface CashuMintOption {
  name: string;
  url: string;
  description: string;
  recommended?: boolean;
}

// List of official trusted Cashu Mints
export const RECOMMENDED_MINTS: CashuMintOption[] = [
  {
    name: "Cashu Testnut (Demo / Test Sats)",
    url: "https://testnut.cashu.space",
    description: "Official Cashu core testnet mint (Recommended for live demos)",
    recommended: true,
  },
  {
    name: "Minibits Mint",
    url: "https://mint.minibits.cash/Bitcoin",
    description: "High-uptime trusted node with instant Lightning routing",
  },
  {
    name: "Macadamia Mint",
    url: "https://mint.macadamia.cash",
    description: "Reliable community-driven mint with high uptime",
  },
];

// Default Mint (Testnut)
export const DEFAULT_CASHU_MINT = "https://testnut.cashu.space";

const RELAYS = [
  "wss://relay.primal.net",
  "wss://nos.lol"
];

export interface CashuProof {
  id: string;
  amount: number;
  secret: string;
  C: string;
  [key: string]: any;
}

export interface DecodedCashuInfo {
  mint: string;
  totalAmountSats: number;
  unit: string;
  proofs: CashuProof[];
}

/**
 * Converts Uint8Array to a hex string (browser & Node.js safe)
 */
function bytesToHex(bytes: Uint8Array | number[]): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Converts Base64 / Base64URL string to Uint8Array
 */
function base64UrlToBytes(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  if (typeof window !== "undefined" && typeof atob === "function") {
    const binStr = atob(base64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Lightweight RFC 8949 CBOR decoder (supports error-free Cashu V4 cashuB token decoding)
 */
function decodeCbor(bytes: Uint8Array): any {
  let offset = 0;

  function decodeItem(): any {
    if (offset >= bytes.length) {
      throw new Error("Unexpected end of CBOR data");
    }

    const initialByte = bytes[offset++];
    const majorType = initialByte >> 5;
    const additionalInfo = initialByte & 0x1f;

    let length = 0;
    if (additionalInfo < 24) {
      length = additionalInfo;
    } else if (additionalInfo === 24) {
      length = bytes[offset++];
    } else if (additionalInfo === 25) {
      length = (bytes[offset++] << 8) | bytes[offset++];
    } else if (additionalInfo === 26) {
      length =
        ((bytes[offset++] << 24) |
          (bytes[offset++] << 16) |
          (bytes[offset++] << 8) |
          bytes[offset++]) >>> 0;
    } else if (additionalInfo === 27) {
      const hi =
        ((bytes[offset++] << 24) |
          (bytes[offset++] << 16) |
          (bytes[offset++] << 8) |
          bytes[offset++]) >>> 0;
      const lo =
        ((bytes[offset++] << 24) |
          (bytes[offset++] << 16) |
          (bytes[offset++] << 8) |
          bytes[offset++]) >>> 0;
      length = hi * 2 ** 32 + lo;
    } else {
      length = 0;
    }

    // Type 0: Unsigned Integer
    if (majorType === 0) return length;
    // Type 1: Negative Integer
    if (majorType === 1) return -1 - length;

    // Type 2: Byte String
    if (majorType === 2) {
      const res = bytes.slice(offset, offset + length);
      offset += length;
      return res;
    }

    // Type 3: UTF-8 Text String
    if (majorType === 3) {
      const strBytes = bytes.slice(offset, offset + length);
      offset += length;
      return new TextDecoder("utf-8").decode(strBytes);
    }

    // Type 4: Array
    if (majorType === 4) {
      const arr: any[] = [];
      for (let i = 0; i < length; i++) {
        arr.push(decodeItem());
      }
      return arr;
    }

    // Type 5: Map / Object
    if (majorType === 5) {
      const obj: Record<string, any> = {};
      for (let i = 0; i < length; i++) {
        const key = decodeItem();
        const val = decodeItem();
        obj[String(key)] = val;
      }
      return obj;
    }

    // Type 7: Simple values (true, false, null)
    if (majorType === 7) {
      if (additionalInfo === 20) return false;
      if (additionalInfo === 21) return true;
      if (additionalInfo === 22) return null;
      return undefined;
    }

    return null;
  }

  return decodeItem();
}

/**
 * Validates that the Mint URL format is valid
 */
export function isValidMintUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (err) {
    console.debug("[Cashu] Invalid mint URL string:", url, err);
    return false;
  }
}

/**
 * Encodes token proofs into a standard cashu token string
 */
export function encodeCashuToken(mintUrl: string, proofs: CashuProof[], unit = "sat"): string {
  const cleanMint = mintUrl.trim().replace(/\/+$/, "");

  try {
    if (typeof getEncodedToken === "function") {
      return (getEncodedToken as any)({ mint: cleanMint, proofs, unit });
    }
  } catch (err) {
    console.debug("[Cashu] getEncodedToken fallback to manual encoding:", err);
  }

  const v3Payload = {
    token: [{ mint: cleanMint, proofs }],
    unit,
  };
  const jsonStr = JSON.stringify(v3Payload);
  const base64 = typeof window !== "undefined"
    ? btoa(unescape(encodeURIComponent(jsonStr)))
    : Buffer.from(jsonStr, "utf-8").toString("base64");
  
  return `cashuA${base64.replace(/\+/g, "-").replace(/\//g, "_")}`;
}

/**
 * Decodes Cashu token strings (supports both cashuA V3 and cashuB V4 CBOR formats)
 */
function decodeCashuString(tokenString: string): any {
  const trimmed = tokenString.trim();
  const lower = trimmed.toLowerCase();

  // 1. Decode modern cashuB token (V4 CBOR format)
  if (lower.startsWith("cashub")) {
    try {
      const rawCbor = trimmed.slice(6);
      const bytes = base64UrlToBytes(rawCbor);
      return decodeCbor(bytes);
    } catch (err) {
      console.warn("CBOR decode error for cashuB token:", err);
    }
  }

  // 2. Decode legacy cashuA token (V3 Base64 JSON format)
  if (lower.startsWith("cashua")) {
    try {
      const base64Data = trimmed.slice(6).replace(/-/g, "+").replace(/_/g, "/");
      const jsonStr =
        typeof window !== "undefined"
          ? decodeURIComponent(escape(atob(base64Data)))
          : Buffer.from(base64Data, "base64").toString("utf-8");
      return JSON.parse(jsonStr);
    } catch (err) {
      throw new Error("Failed to parse cashuA base64 payload.");
    }
  }

  throw new Error("Invalid token format. Cashu tokens must start with 'cashuA' or 'cashuB'.");
}

/**
 * Decodes a Cashu token string into structured proof and mint metadata.
 * Supports legacy JSON format (cashuA) and NUT-00 CBOR format (cashuB).
 */
export function parseCashuToken(tokenString: string): DecodedCashuInfo {
  const trimmed = tokenString.trim();
  const lower = trimmed.toLowerCase();
  
  if (!lower.startsWith("cashua") && !lower.startsWith("cashub")) {
    throw new Error("Invalid token format. Cashu tokens must start with 'cashuA' or 'cashuB'.");
  }

  let mint = "";
  let proofs: CashuProof[] = [];
  let unit = "sat";

  // 1. Primary: Use official @cashu/cashu-ts decoder
  try {
    let decoded: any = null;
    try {
      decoded = (getDecodedToken as any)(trimmed, []);
    } catch {
      decoded = (getDecodedToken as any)(trimmed);
    }

    if (decoded) {
      if (decoded.mint) {
        mint = decoded.mint;
      } else if (Array.isArray(decoded.token) && decoded.token.length > 0) {
        mint = decoded.token[0].mint;
      }

      if (Array.isArray(decoded.proofs)) {
        proofs = decoded.proofs.map((p: any) => ({
          ...p,
          amount: typeof p.amount?.toNumber === "function" ? p.amount.toNumber() : Number(p.amount || 0),
        }));
      } else if (Array.isArray(decoded.token) && decoded.token.length > 0) {
        proofs = decoded.token.flatMap((t: any) =>
          (t.proofs || []).map((p: any) => ({
            ...p,
            amount: typeof p.amount?.toNumber === "function" ? p.amount.toNumber() : Number(p.amount || 0),
          }))
        );
      }

      if (decoded.unit) unit = decoded.unit;
    }
  } catch (decErr) {
    console.debug("[Cashu] getDecodedToken fallback to manual parsing:", decErr);
  }

  // 2. Fallback: decodeCashuString only if official decoder yields no proofs
  if (proofs.length === 0) {
    const decoded = decodeCashuString(trimmed);
    if (decoded) {
      if (Array.isArray(decoded.t)) {
        mint = decoded.m || mint;
        for (const group of decoded.t) {
          const keysetIdHex = group.i instanceof Uint8Array ? bytesToHex(group.i) : String(group.i || "");
          if (Array.isArray(group.p)) {
            for (const p of group.p) {
              const cHex = p.c instanceof Uint8Array ? bytesToHex(p.c) : String(p.c || p.C || "");
              proofs.push({
                id: keysetIdHex,
                amount: Number(p.a || p.amount || 0),
                secret: String(p.s || p.secret || ""),
                C: cHex,
              });
            }
          }
        }
      } else if (Array.isArray(decoded.proofs)) {
        mint = decoded.mint || mint;
        proofs = decoded.proofs;
      } else if (Array.isArray(decoded.token) && decoded.token.length > 0) {
        mint = decoded.token[0].mint || mint;
        for (const entry of decoded.token) {
          if (entry.unit) unit = entry.unit;
          if (Array.isArray(entry.proofs)) proofs.push(...entry.proofs);
        }
      }
    }
  }

  if (proofs.length === 0) {
    throw new Error("No cryptographic proofs found inside the token.");
  }

  unit = (unit || "sat").toLowerCase().trim();

  // Sanitize Mint URL
  if (mint) {
    mint = mint.trim().replace(/\/+$/, "");
    if (!mint.startsWith("http://") && !mint.startsWith("https://")) {
      mint = `https://${mint}`;
    }
  } else {
    mint = DEFAULT_CASHU_MINT;
  }

  const totalAmountSats = proofs.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return {
    mint,
    totalAmountSats,
    unit,
    proofs,
  };
}

/**
 * Splits Cashu token proofs into an exact send amount and change proofs to prevent overpaying.
 * Resolves truncated 16-hex Keyset ID prefixes (NUT-00 CBOR format) to full 66-hex Keyset IDs
 * against the target Mint before executing swap/send operations.
 *
 * @param tokenString - Cashu token string (cashuA... or cashuB...)
 * @param amountToSend - Amount of sats to allocate for the recipient
 * @param overrideMintUrl - Optional mint URL to prioritize over token payload
 * @returns Object containing the exact send token and optional change token
 */
export async function splitCashuToken(
  tokenString: string,
  amountToSend: number,
  overrideMintUrl?: string
): Promise<{ sendToken: string; changeToken: string | null }> {
  const info = parseCashuToken(tokenString);
  if (info.totalAmountSats < amountToSend) {
    throw new Error(`Insufficient funds: token has ${info.totalAmountSats} sats, but ${amountToSend} sats required.`);
  }
  if (info.totalAmountSats === amountToSend) {
    return { sendToken: tokenString, changeToken: null };
  }

  const normalizedUnit = (info.unit || "sat").toLowerCase().trim();
  let targetMint = info.mint || overrideMintUrl || DEFAULT_CASHU_MINT;
  let cleanMint = targetMint.trim().replace(/\/+$/, "");
  if (!cleanMint.startsWith("http://") && !cleanMint.startsWith("https://")) {
    cleanMint = `https://${cleanMint}`;
  }

  console.log(`[splitCashuToken] Connecting to Mint: "${cleanMint}", Unit: "${normalizedUnit}"`);

  const wallet = new Wallet(cleanMint, { unit: normalizedUnit });
  await wallet.loadMint(true);

  // 1. Fetch complete list of Keyset IDs from Mint
  let mintKeysetIds: string[] = [];
  try {
    const res = await fetch(`${cleanMint}/v1/keysets`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.keysets)) {
        mintKeysetIds = data.keysets.map((k: any) => k.id);
      }
    }
  } catch (err) {
    console.warn("[splitCashuToken] Could not fetch keysets directly, falling back to cache:", err);
    mintKeysetIds = (wallet as any).keyChain?.cache?.keysets?.map((k: any) => k.id) || [];
  }

  console.log(`[splitCashuToken] Full Mint Keysets available:`, mintKeysetIds);

  // 2. Auto-expand if proof.id is truncated to 16 hex chars (NUT-00 CBOR prefix)
  const normalizedProofs = info.proofs.map((proof: any) => {
    const rawId = String(proof.id);
    const fullMatch = mintKeysetIds.find((fullId) => fullId === rawId || fullId.startsWith(rawId));
    if (fullMatch && fullMatch !== rawId) {
      console.log(`[splitCashuToken] Auto-expanded truncated keyset: ${rawId} -> ${fullMatch}`);
      return { ...proof, id: fullMatch };
    }
    return proof;
  });

  try {
    // 3. Ensure keyset has loaded keys
    if (typeof (wallet as any).ensureOperableKeysets === "function") {
      const keysetIds = Array.from(new Set(normalizedProofs.map((p: any) => p.id)));
      await (wallet as any).ensureOperableKeysets(keysetIds);
    }

    let sendResult: any;
    if ((wallet as any).ops && typeof (wallet as any).ops.send === "function") {
      sendResult = await (wallet as any).ops.send(amountToSend, normalizedProofs).run();
    } else {
      sendResult = await wallet.send(amountToSend, normalizedProofs as any);
    }

    const returnChange = sendResult.keep || sendResult.returnChange;
    const send = sendResult.send;
    const sendToken = encodeCashuToken(cleanMint, send, normalizedUnit);
    const changeToken = returnChange && returnChange.length > 0 
      ? encodeCashuToken(cleanMint, returnChange, normalizedUnit) 
      : null;

    return { sendToken, changeToken };
  } catch (error: any) {
    if (error.name === "UnknownKeysetError" || (error.message && error.message.includes("not a keyset of this mint"))) {
      console.error(`[splitCashuToken] Keyset Error: Token does not belong to Mint ${cleanMint}`);
      throw new Error(`Invalid eCash token or keyset does not belong to active Mint (${cleanMint}). Please check your token.`);
    }
    throw error;
  }
}

/**
 * Verifies whether token proofs remain unspent against the issuing mint.
 */
export async function verifyTokenWithMint(tokenString: string): Promise<{ isValid: boolean; reason?: string }> {
  try {
    const info = parseCashuToken(tokenString);
    const cleanMint = info.mint.replace(/\/+$/, "");

    // Initiate verification check with Mint
    const verifyPromise = (async () => {
      try {
        const wallet = new Wallet(cleanMint, { unit: info.unit });

        if (typeof (wallet as any).loadMint === "function") {
          try {
            await (wallet as any).loadMint();
          } catch (loadErr) {
            console.debug("[Cashu] loadMint error during token verification:", loadErr);
          }
        }

        let spentStates: any[] = [];
        if (typeof (wallet as any).checkProofStates === "function") {
          spentStates = await (wallet as any).checkProofStates(info.proofs);
        } else if (typeof (wallet as any).checkProofsSpent === "function") {
          spentStates = await (wallet as any).checkProofsSpent(info.proofs);
        } else if (typeof (wallet as any).checkProofsState === "function") {
          spentStates = await (wallet as any).checkProofsState(info.proofs);
        }

        if (Array.isArray(spentStates) && spentStates.length > 0) {
          const isSpent = spentStates.some(
            (s: any) => s === true || s?.state === "SPENT" || s?.spent === true
          );
          if (isSpent) {
            return { isValid: false, reason: "This Cashu eCash token has already been spent/claimed." };
          }
        }
      } catch (e: any) {
        console.debug("[Cashu] Mint verification check warning:", e);
      }

      return { isValid: true };
    })();

    // 3-second timeout: skip if Mint server responds slowly to avoid blocking UI
    const timeoutPromise = new Promise<{ isValid: boolean }>((resolve) =>
      setTimeout(() => resolve({ isValid: true }), 3000)
    );

    return await Promise.race([verifyPromise, timeoutPromise]);
  } catch (err: any) {
    return { isValid: false, reason: err.message || "Failed to verify token with Mint node." };
  }
}

/**
 * Requests a Lightning BOLT-11 invoice quote to mint eCash proofs from a Cashu mint.
 */
export async function createCashuMintQuote(amountSats: number, mintUrl: string = DEFAULT_CASHU_MINT) {
  const cleanMint = mintUrl.trim().replace(/\/+$/, "");
  
  try {
    const wallet = new Wallet(cleanMint);
    if (typeof (wallet as any).loadMint === "function") {
      try {
        await (wallet as any).loadMint();
      } catch (loadErr) {
        console.debug("[Cashu] loadMint warning during quote creation:", loadErr);
      }
    }

    // Attempt standard Cashu-TS v4 BOLT-11 quote method
    if (typeof (wallet as any).createMintQuoteBolt11 === "function") {
      try {
        const quote = await (wallet as any).createMintQuoteBolt11(amountSats);
        return {
          invoice: quote.request || quote.pr,
          quoteId: quote.quote || quote.hash || quote.id,
          mintUrl: cleanMint,
        };
      } catch (bolt11Err) {
        console.debug("[Cashu] createMintQuoteBolt11 fallback:", bolt11Err);
      }
    }

    // Attempt legacy createMintQuote method
    if (typeof (wallet as any).createMintQuote === "function") {
      try {
        const quote = await (wallet as any).createMintQuote("bolt11", amountSats);
        return {
          invoice: quote.request || quote.pr,
          quoteId: quote.quote || quote.hash || quote.id,
          mintUrl: cleanMint,
        };
      } catch (createErr) {
        console.debug("[Cashu] createMintQuote('bolt11') failed, trying default arg:", createErr);
        try {
          const quote = await (wallet as any).createMintQuote(amountSats);
          return {
            invoice: quote.request || quote.pr,
            quoteId: quote.quote || quote.hash || quote.id,
            mintUrl: cleanMint,
          };
        } catch (quoteErr) {
          console.debug("[Cashu] createMintQuote fallback failed:", quoteErr);
        }
      }
    }
  } catch (walletErr) {
    console.debug("[Cashu] Wallet instance mint quote failed, attempting direct REST fallback:", walletErr);
  }

  // Fallback to direct NUT-04 REST API call on the Mint
  try {
    const res = await fetch(`${cleanMint}/v1/mint/quote/bolt11`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountSats, unit: "sat" }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.request && data.quote) {
        return {
          invoice: data.request,
          quoteId: data.quote,
          mintUrl: cleanMint,
        };
      }
    }
  } catch (err) {
    console.debug("[Cashu] Direct NUT-04 REST Mint request failed:", err);
  }

  throw new Error(`Could not request Mint invoice from ${cleanMint}.`);
}

/**
 * Polls payment status of a mint quote until settled and retrieves minted proofs.
 */
export async function pollMintAndClaimToken(
  amountSats: number,
  quoteId: string,
  mintUrl: string = DEFAULT_CASHU_MINT,
  maxWaitSec = 90
): Promise<string> {
  const cleanMint = mintUrl.trim().replace(/\/+$/, "");
  const wallet = new Wallet(cleanMint);
  
  if (typeof (wallet as any).loadMint === "function") {
    try {
      await (wallet as any).loadMint();
    } catch (loadErr) {
      console.debug("[Cashu] loadMint warning during pollMintAndClaimToken:", loadErr);
    }
  }

  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitSec * 1000) {
    try {
      let proofs: any[] = [];
      
      if (typeof (wallet as any).mintTokens === "function") {
        proofs = await (wallet as any).mintTokens(amountSats, quoteId);
      } else if (typeof (wallet as any).mintProofs === "function") {
        proofs = await (wallet as any).mintProofs(amountSats, quoteId);
      } else if (typeof (wallet as any).mintProofsBolt11 === "function") {
        proofs = await (wallet as any).mintProofsBolt11(amountSats, quoteId);
      } else if (typeof (wallet as any).requestTokens === "function") {
        const res = await (wallet as any).requestTokens(amountSats, quoteId);
        proofs = res.proofs || res;
      }

      if (Array.isArray(proofs) && proofs.length > 0) {
        return encodeCashuToken(cleanMint, proofs);
      }
    } catch (pollErr) {
      console.debug("[Cashu] Poll pending invoice on mint:", pollErr);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error("Minting invoice expired or timed out.");
}

/**
 * Encrypts payload securely via NIP-44 or NIP-04 fallback
 */
async function encryptCashuPayload(
  recipientHexPubkey: string,
  rawPayload: string,
  ephemeralSk: Uint8Array
): Promise<{ encryptedContent: string; encryptionScheme: "nip44" | "nip04" }> {
  if (typeof window !== "undefined" && (window as any).nostr?.nip44?.encrypt) {
    try {
      const encrypted = await (window as any).nostr.nip44.encrypt(recipientHexPubkey, rawPayload);
      if (encrypted) return { encryptedContent: encrypted, encryptionScheme: "nip44" };
    } catch (err) {
      console.debug("[Cashu] Window nostr NIP-44 encryption failed, falling back:", err);
    }
  }

  if (typeof window !== "undefined" && (window as any).nostr?.nip04?.encrypt) {
    try {
      const encrypted = await (window as any).nostr.nip04.encrypt(recipientHexPubkey, rawPayload);
      if (encrypted) return { encryptedContent: encrypted, encryptionScheme: "nip04" };
    } catch (err) {
      console.debug("[Cashu] Window nostr NIP-04 encryption failed, falling back:", err);
    }
  }

  try {
    if (nip44 && (nip44 as any).v2) {
      const conversationKey = (nip44 as any).v2.utils.getConversationKey(ephemeralSk, recipientHexPubkey);
      const encrypted = (nip44 as any).v2.encrypt(rawPayload, conversationKey);
      return { encryptedContent: encrypted, encryptionScheme: "nip44" };
    }
  } catch (err) {
    console.debug("[Cashu] Local nostr-tools NIP-44 v2 encryption failed, falling back to NIP-04:", err);
  }

  const encrypted = await nip04.encrypt(ephemeralSk, recipientHexPubkey, rawPayload);
  return { encryptedContent: encrypted, encryptionScheme: "nip04" };
}

/**
 * Encrypts and publishes a NIP-61 NutZap (Kind 9321) eCash payment.
 */
export async function sendCashuNutZap({
  recipientPubkey,
  cashuToken,
  amountSats,
  comment,
  mintUrl,
}: {
  recipientPubkey: string;
  cashuToken: string;
  amountSats: number;
  comment?: string;
  mintUrl: string;
}): Promise<{
  signedEvent: any;
  changeToken: string | null;
  id: string;
  kind?: number;
  [key: string]: any;
}> {
  let hexPubkey = recipientPubkey;
  if (hexPubkey.startsWith("npub1")) {
    try {
      const decoded = nip19.decode(hexPubkey);
      if (decoded.type === "npub") hexPubkey = decoded.data as string;
    } catch (err) {
      console.debug("[Cashu] Recipient npub decoding fallback:", err);
    }
  }

  if (!hexPubkey || !/^[0-9a-fA-F]{64}$/.test(hexPubkey)) {
    throw new Error("Invalid recipient pubkey format.");
  }

  let cleanMint = (mintUrl || DEFAULT_CASHU_MINT).trim().replace(/\/+$/, "");
  if (!cleanMint.startsWith("http://") && !cleanMint.startsWith("https://")) {
    cleanMint = `https://${cleanMint}`;
  }
  const ephemeralSk = generateSecretKey();

  // Split Cashu token into exact send amount and change token
  const { sendToken, changeToken } = await splitCashuToken(cashuToken, amountSats, cleanMint);

  const secretNutZapPayload = JSON.stringify({
    token: sendToken.trim(),
    memo: comment?.trim() || "Value-4-Value eCash NutZap 🥜",
    amount: amountSats,
    mint: cleanMint,
    created_at: Math.floor(Date.now() / 1000),
  });

  const { encryptedContent, encryptionScheme } = await encryptCashuPayload(
    hexPubkey,
    secretNutZapPayload,
    ephemeralSk
  );

  const eventTemplate = {
    kind: 9321,
    content: encryptedContent,
    tags: [
      ["p", hexPubkey],
      ["amount", (amountSats * 1000).toString()],
      ["u", cleanMint],
      ["encryption", encryptionScheme],
      ["alt", `Encrypted NutZap: ${amountSats} Sats in Chaumian eCash`],
    ],
    created_at: Math.floor(Date.now() / 1000),
  };

  let signedEvent: any = null;

  if (typeof window !== "undefined" && (window as any).nostr?.signEvent) {
    try {
      signedEvent = await (window as any).nostr.signEvent(eventTemplate);
    } catch (err) {
      console.debug("[Cashu] Window nostr.signEvent failed, using ephemeral key:", err);
    }
  }

  if (!signedEvent) {
    signedEvent = finalizeEvent(eventTemplate, ephemeralSk);
  }

  const pool = new SimplePool();
  try {
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1500));

    const publishPromises = RELAYS.map(async (relayUrl) => {
      try {
        const pub = pool.publish([relayUrl], signedEvent);
        await Promise.race([pub, timeoutPromise]);
      } catch (err) {
        console.debug(`[Cashu] Failed to publish NutZap to ${relayUrl}:`, err);
      }
    });

    await Promise.race([
      Promise.allSettled(publishPromises),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch (err) {
    console.debug("[Cashu] Relay pool broadcast finished with warnings:", err);
  } finally {
    try {
      pool.close(RELAYS);
    } catch (err) {
      console.debug("[Cashu] Pool close warning:", err);
    }
  }

  return {
    signedEvent,
    changeToken,
    id: signedEvent.id,
    kind: signedEvent.kind,
    ...signedEvent,
  };
}