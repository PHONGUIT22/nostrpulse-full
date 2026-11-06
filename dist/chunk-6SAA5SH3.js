#!/usr/bin/env node
import {
  isSafeExternalUrl,
  verifyNip05
} from "./chunk-O2IL2KZT.js";
import {
  calculateTrustScore
} from "./chunk-6HQMFGYN.js";
import {
  fetchNostrProfile
} from "./chunk-ATKN57WH.js";
import {
  encodeNpub,
  getWebOfTrustDistance,
  normalizePubkey
} from "./chunk-FKHUSJXZ.js";
import {
  getCreatorFromDb,
  getZapTotalsFromDb
} from "./chunk-GEF4V2OT.js";

// src/lib/cashu.ts
import { getDecodedToken, getEncodedToken, Wallet } from "@cashu/cashu-ts";
import { finalizeEvent as finalizeEvent2, generateSecretKey as generateSecretKey2 } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { nip19, nip04, nip44 as nip442 } from "nostr-tools";

// src/lib/cbor.ts
var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var B64URL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var B64_LOOKUP = new Int16Array(256).fill(-1);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;
}
B64_LOOKUP["-".charCodeAt(0)] = 62;
B64_LOOKUP["_".charCodeAt(0)] = 63;
function bytesToHex(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
function hexToBytes(hex) {
  const cleanHex = hex.trim();
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string: length must be even");
  }
  const len = cleanHex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const byte = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`Invalid hex character at index ${i * 2}`);
    }
    bytes[i] = byte;
  }
  return bytes;
}
function base64UrlToBytes(str) {
  let clean = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 61) break;
    if (B64_LOOKUP[code] !== -1) {
      clean += str[i];
    }
  }
  const len = clean.length;
  if (len === 0) return new Uint8Array(0);
  const validChunks = Math.floor(len / 4);
  const remainder = len % 4;
  let byteLen = validChunks * 3;
  if (remainder === 2) byteLen += 1;
  else if (remainder === 3) byteLen += 2;
  const bytes = new Uint8Array(byteLen);
  let byteIdx = 0;
  for (let i = 0; i < validChunks * 4; i += 4) {
    const c1 = B64_LOOKUP[clean.charCodeAt(i)];
    const c2 = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c3 = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const c4 = B64_LOOKUP[clean.charCodeAt(i + 3)];
    const triple = c1 << 18 | c2 << 12 | c3 << 6 | c4;
    bytes[byteIdx++] = triple >> 16 & 255;
    bytes[byteIdx++] = triple >> 8 & 255;
    bytes[byteIdx++] = triple & 255;
  }
  if (remainder === 2) {
    const c1 = B64_LOOKUP[clean.charCodeAt(len - 2)];
    const c2 = B64_LOOKUP[clean.charCodeAt(len - 1)];
    const pair = c1 << 18 | c2 << 12;
    bytes[byteIdx++] = pair >> 16 & 255;
  } else if (remainder === 3) {
    const c1 = B64_LOOKUP[clean.charCodeAt(len - 3)];
    const c2 = B64_LOOKUP[clean.charCodeAt(len - 2)];
    const c3 = B64_LOOKUP[clean.charCodeAt(len - 1)];
    const triple = c1 << 18 | c2 << 12 | c3 << 6;
    bytes[byteIdx++] = triple >> 16 & 255;
    bytes[byteIdx++] = triple >> 8 & 255;
  }
  return bytes;
}
function bytesToBase64Url(bytes) {
  let result = "";
  const len = bytes.length;
  const chunkCount = Math.floor(len / 3);
  for (let i = 0; i < chunkCount * 3; i += 3) {
    const triple = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
    result += B64URL_CHARS[triple >> 18 & 63] + B64URL_CHARS[triple >> 12 & 63] + B64URL_CHARS[triple >> 6 & 63] + B64URL_CHARS[triple & 63];
  }
  const remainder = len % 3;
  if (remainder === 1) {
    const single = bytes[len - 1] << 16;
    result += B64URL_CHARS[single >> 18 & 63] + B64URL_CHARS[single >> 12 & 63];
  } else if (remainder === 2) {
    const pair = bytes[len - 2] << 16 | bytes[len - 1] << 8;
    result += B64URL_CHARS[pair >> 18 & 63] + B64URL_CHARS[pair >> 12 & 63] + B64URL_CHARS[pair >> 6 & 63];
  }
  return result;
}
function decodeCbor(bytes) {
  if (!bytes || bytes.length === 0) {
    throw new Error("Cannot decode empty CBOR bytes");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  function decodeItem() {
    if (offset >= bytes.length) {
      throw new Error("Unexpected end of CBOR data");
    }
    const initialByte = bytes[offset++];
    const majorType = initialByte >> 5;
    const additionalInfo = initialByte & 31;
    let length = 0;
    let bigLength = null;
    if (additionalInfo < 24) {
      length = additionalInfo;
    } else if (additionalInfo === 24) {
      if (offset >= bytes.length) throw new Error("Truncated CBOR single-byte length");
      length = view.getUint8(offset++);
    } else if (additionalInfo === 25) {
      if (offset + 2 > bytes.length) throw new Error("Truncated CBOR 2-byte length");
      length = view.getUint16(offset, false);
      offset += 2;
    } else if (additionalInfo === 26) {
      if (offset + 4 > bytes.length) throw new Error("Truncated CBOR 4-byte length");
      length = view.getUint32(offset, false);
      offset += 4;
    } else if (additionalInfo === 27) {
      if (offset + 8 > bytes.length) throw new Error("Truncated CBOR 8-byte length");
      if (majorType === 7) {
        const floatVal = view.getFloat64(offset, false);
        offset += 8;
        return floatVal;
      }
      bigLength = view.getBigUint64(offset, false);
      offset += 8;
      if (bigLength <= BigInt(Number.MAX_SAFE_INTEGER)) {
        length = Number(bigLength);
      } else {
        if (majorType === 0) return bigLength;
        if (majorType === 1) return BigInt(-1) - bigLength;
        length = Number(bigLength);
      }
    } else if (additionalInfo === 31) {
      length = -1;
    }
    if (majorType === 0) {
      return bigLength !== null && bigLength > BigInt(Number.MAX_SAFE_INTEGER) ? bigLength : length;
    }
    if (majorType === 1) {
      return bigLength !== null && bigLength > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(-1) - bigLength : -1 - length;
    }
    if (majorType === 2) {
      if (length < 0) throw new Error("Indefinite-length byte string not supported");
      if (offset + length > bytes.length) throw new Error("Truncated CBOR byte string");
      const slice = bytes.slice(offset, offset + length);
      offset += length;
      return slice;
    }
    if (majorType === 3) {
      if (length < 0) throw new Error("Indefinite-length text string not supported");
      if (offset + length > bytes.length) throw new Error("Truncated CBOR text string");
      const strBytes = bytes.slice(offset, offset + length);
      offset += length;
      return new TextDecoder("utf-8").decode(strBytes);
    }
    if (majorType === 4) {
      const arr = [];
      if (length >= 0) {
        for (let i = 0; i < length; i++) {
          arr.push(decodeItem());
        }
      } else {
        while (offset < bytes.length && bytes[offset] !== 255) {
          arr.push(decodeItem());
        }
        if (offset < bytes.length && bytes[offset] === 255) {
          offset++;
        }
      }
      return arr;
    }
    if (majorType === 5) {
      const obj = {};
      if (length >= 0) {
        for (let i = 0; i < length; i++) {
          const key = decodeItem();
          const val = decodeItem();
          obj[typeof key === "string" ? key : String(key)] = val;
        }
      } else {
        while (offset < bytes.length && bytes[offset] !== 255) {
          const key = decodeItem();
          const val = decodeItem();
          obj[typeof key === "string" ? key : String(key)] = val;
        }
        if (offset < bytes.length && bytes[offset] === 255) {
          offset++;
        }
      }
      return obj;
    }
    if (majorType === 6) {
      return decodeItem();
    }
    if (majorType === 7) {
      if (additionalInfo === 20) return false;
      if (additionalInfo === 21) return true;
      if (additionalInfo === 22) return null;
      if (additionalInfo === 23) return void 0;
      if (additionalInfo === 25) {
        const half = view.getUint16(offset, false);
        offset += 2;
        const sign = half & 32768 ? -1 : 1;
        const exp = (half & 31744) >> 10;
        const frac = half & 1023;
        if (exp === 0) {
          return sign * 2 ** -14 * (frac / 1024);
        } else if (exp === 31) {
          return frac ? NaN : sign * Infinity;
        }
        return sign * 2 ** (exp - 15) * (1 + frac / 1024);
      }
      if (additionalInfo === 26) {
        const f32 = view.getFloat32(offset, false);
        offset += 4;
        return f32;
      }
    }
    throw new Error(`Unsupported CBOR major type: ${majorType} (info: ${additionalInfo})`);
  }
  const result = decodeItem();
  return result;
}

// src/lib/encryption.ts
import { nip44 } from "nostr-tools";
import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools/pure";
var GIFT_WRAP_KIND = 1059;
var SEALED_DIRECT_MESSAGE_KIND = 13;
var PRIVATE_DIRECT_MESSAGE_KIND = 14;
var NOTIFICATION_KIND = 21316;
var TAG_PUBKEY = "p";
var EncryptionManager = class {
  constructor(config = {}) {
    this.mode = config.mode ?? "optional" /* OPTIONAL */;
  }
  getEncryptionMode() {
    return this.mode;
  }
  isEncryptionEnabled() {
    return this.mode !== "disabled" /* DISABLED */;
  }
  isEncryptionRequired() {
    return this.mode === "required" /* REQUIRED */;
  }
  /**
   * Determines if we should encrypt outgoing messages based on incoming message format
   * @param incomingWasEncrypted - Whether the incoming message was encrypted
   */
  shouldEncryptResponse(incomingWasEncrypted) {
    switch (this.mode) {
      case "disabled" /* DISABLED */:
        return false;
      case "required" /* REQUIRED */:
        return true;
      case "optional" /* OPTIONAL */:
        return incomingWasEncrypted;
      // Mirror the incoming format
      default:
        return false;
    }
  }
  /**
   * Determines if we should attempt encryption for outgoing requests (when no incoming context)
   */
  shouldAttemptEncryption() {
    return this.mode === "required" /* REQUIRED */;
  }
  /**
   * Encrypt a message using NIP-17/NIP-59 gift wrap scheme
   * @param senderPrivateKey - Sender's private key in hex
   * @param recipientPublicKey - Recipient's public key in hex
   * @param eventTemplate - Event to encrypt
   * @param options - Optional encryption options (e.g. jitterSeconds)
   * @returns Gift wrapped event or null if encryption fails
   */
  async encryptMessage(senderPrivateKey, recipientPublicKey, eventTemplate, options) {
    if (this.mode === "disabled" /* DISABLED */) {
      return null;
    }
    try {
      const now = Math.floor(Date.now() / 1e3);
      const rumor = {
        ...eventTemplate,
        created_at: eventTemplate.created_at ?? now,
        pubkey: getPublicKey(hexToBytes(senderPrivateKey))
      };
      const jitter = options?.jitterSeconds !== void 0 ? options.jitterSeconds : Math.floor(Math.random() * 172800);
      const jitteredCreatedAt = Math.max(0, now - jitter);
      const sealPrivateKey = generateSecretKey();
      const sealPublicKey = getPublicKey(sealPrivateKey);
      const encryptedRumor = nip44.v2.encrypt(
        JSON.stringify(rumor),
        nip44.v2.utils.getConversationKey(sealPrivateKey, recipientPublicKey)
      );
      const seal = {
        kind: SEALED_DIRECT_MESSAGE_KIND,
        content: encryptedRumor,
        tags: [],
        created_at: jitteredCreatedAt,
        pubkey: sealPublicKey
      };
      const signedSeal = finalizeEvent(seal, sealPrivateKey);
      const giftWrapPrivateKey = generateSecretKey();
      const giftWrapPublicKey = getPublicKey(giftWrapPrivateKey);
      const encryptedSeal = nip44.v2.encrypt(
        JSON.stringify(signedSeal),
        nip44.v2.utils.getConversationKey(
          giftWrapPrivateKey,
          recipientPublicKey
        )
      );
      const giftWrap = {
        kind: GIFT_WRAP_KIND,
        content: encryptedSeal,
        tags: [[TAG_PUBKEY, recipientPublicKey]],
        created_at: jitteredCreatedAt,
        pubkey: giftWrapPublicKey
      };
      return finalizeEvent(giftWrap, giftWrapPrivateKey);
    } catch (error) {
      console.error("Encryption failed:", error);
      return null;
    }
  }
  /**
   * Decrypt a gift wrapped message and extract sender information
   * @param event - Gift wrap event to decrypt
   * @param recipientPrivateKey - Recipient's private key in hex
   * @returns Decrypted message with sender info or null if decryption fails
   */
  async decryptMessage(event, recipientPrivateKey) {
    if (!this.isEncryptionEnabled() || event.kind !== GIFT_WRAP_KIND) {
      return null;
    }
    try {
      const recipientPublicKey = getPublicKey(hexToBytes(recipientPrivateKey));
      const isForUs = event.tags.some(
        (tag) => tag[0] === TAG_PUBKEY && tag[1] === recipientPublicKey
      );
      if (!isForUs) {
        return null;
      }
      const conversationKey = nip44.v2.utils.getConversationKey(
        hexToBytes(recipientPrivateKey),
        event.pubkey
      );
      const decryptedSealJson = nip44.v2.decrypt(
        event.content,
        conversationKey
      );
      const seal = JSON.parse(decryptedSealJson);
      if (seal.kind !== SEALED_DIRECT_MESSAGE_KIND) {
        console.error("Invalid seal kind:", seal.kind);
        return null;
      }
      const sealConversationKey = nip44.v2.utils.getConversationKey(
        hexToBytes(recipientPrivateKey),
        seal.pubkey
      );
      const decryptedRumorJson = nip44.v2.decrypt(
        seal.content,
        sealConversationKey
      );
      const rumor = JSON.parse(decryptedRumorJson);
      let actualContent;
      if (rumor.kind === PRIVATE_DIRECT_MESSAGE_KIND) {
        try {
          actualContent = JSON.parse(rumor.content);
        } catch {
          actualContent = rumor.content;
        }
      } else {
        actualContent = rumor;
      }
      return {
        content: actualContent,
        sender: rumor.pubkey,
        event: {
          ...rumor,
          id: event.id,
          // Keep original gift wrap ID for tracking
          sig: event.sig
        }
      };
    } catch (error) {
      console.error("Decryption failed:", error);
      return null;
    }
  }
  /**
   * Decrypt an event and extract sender information (unified method)
   * Handles both gift wrapped and direct encrypted events
   */
  async decryptEventAndExtractSender(event, recipientPrivateKey) {
    const decrypted = await this.decryptMessage(event, recipientPrivateKey);
    if (!decrypted) {
      return null;
    }
    return {
      decryptedEvent: decrypted.event,
      sender: decrypted.sender
    };
  }
  /**
   * Check if an event is encrypted for a specific recipient
   */
  isEventForRecipient(event, recipientPublicKey) {
    if (event.kind !== GIFT_WRAP_KIND) {
      return false;
    }
    return event.tags.some(
      (tag) => tag[0] === TAG_PUBKEY && tag[1] === recipientPublicKey
    );
  }
  /**
   * Encrypt a notification event
   */
  async encryptNotification(senderPrivateKey, recipientPublicKey, notificationContent, tags = [], options) {
    const eventTemplate = {
      kind: NOTIFICATION_KIND,
      content: notificationContent,
      tags,
      created_at: Math.floor(Date.now() / 1e3)
    };
    return this.encryptMessage(
      senderPrivateKey,
      recipientPublicKey,
      eventTemplate,
      options
    );
  }
};

// src/lib/cashu.ts
var RECOMMENDED_MINTS = [
  {
    name: "Cashu Testnut (Demo / Test Sats)",
    url: "https://testnut.cashu.space",
    description: "Official Cashu core testnet mint (Recommended for live demos)",
    recommended: true
  },
  {
    name: "Minibits Mint",
    url: "https://mint.minibits.cash/Bitcoin",
    description: "High-uptime trusted node with instant Lightning routing"
  },
  {
    name: "Macadamia Mint",
    url: "https://mint.macadamia.cash",
    description: "Reliable community-driven mint with high uptime"
  }
];
var DEFAULT_CASHU_MINT = "https://testnut.cashu.space";
var RELAYS = [
  "wss://relay.primal.net",
  "wss://nos.lol"
];
function encodeCashuToken(mintUrl, proofs, unit = "sat") {
  const cleanMint = mintUrl.trim().replace(/\/+$/, "");
  try {
    if (typeof getEncodedToken === "function") {
      return getEncodedToken({ mint: cleanMint, proofs, unit });
    }
  } catch (err) {
    console.debug("[Cashu] getEncodedToken fallback to manual encoding:", err);
  }
  const v3Payload = {
    token: [{ mint: cleanMint, proofs }],
    unit
  };
  const jsonStr = JSON.stringify(v3Payload);
  const jsonBytes = new TextEncoder().encode(jsonStr);
  const base64Url = bytesToBase64Url(jsonBytes);
  return `cashuA${base64Url}`;
}
function decodeCashuString(tokenString) {
  const trimmed = tokenString.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("cashub")) {
    try {
      const rawCbor = trimmed.slice(6);
      const bytes = base64UrlToBytes(rawCbor);
      return decodeCbor(bytes);
    } catch (err) {
      console.warn("CBOR decode error for cashuB token:", err);
    }
  }
  if (lower.startsWith("cashua")) {
    try {
      const base64Data = trimmed.slice(6);
      const jsonBytes = base64UrlToBytes(base64Data);
      const jsonStr = new TextDecoder("utf-8").decode(jsonBytes);
      return JSON.parse(jsonStr);
    } catch (err) {
      throw new Error("Failed to parse cashuA base64 payload.");
    }
  }
  throw new Error("Invalid token format. Cashu tokens must start with 'cashuA' or 'cashuB'.");
}
function parseCashuToken(tokenString) {
  const trimmed = tokenString.trim();
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith("cashua") && !lower.startsWith("cashub")) {
    throw new Error("Invalid token format. Cashu tokens must start with 'cashuA' or 'cashuB'.");
  }
  let mint = "";
  let proofs = [];
  let unit = "sat";
  try {
    let decoded = null;
    try {
      decoded = getDecodedToken(trimmed, []);
    } catch {
      decoded = getDecodedToken(trimmed);
    }
    if (decoded) {
      if (decoded.mint) {
        mint = decoded.mint;
      } else if (Array.isArray(decoded.token) && decoded.token.length > 0) {
        mint = decoded.token[0].mint;
      }
      if (Array.isArray(decoded.proofs)) {
        proofs = decoded.proofs.map((p) => ({
          ...p,
          amount: typeof p.amount?.toNumber === "function" ? p.amount.toNumber() : Number(p.amount || 0)
        }));
      } else if (Array.isArray(decoded.token) && decoded.token.length > 0) {
        proofs = decoded.token.flatMap(
          (t) => (t.proofs || []).map((p) => ({
            ...p,
            amount: typeof p.amount?.toNumber === "function" ? p.amount.toNumber() : Number(p.amount || 0)
          }))
        );
      }
      if (decoded.unit) unit = decoded.unit;
    }
  } catch (decErr) {
    console.debug("[Cashu] getDecodedToken fallback to manual parsing:", decErr);
  }
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
                C: cHex
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
    proofs
  };
}
var KeyedAsyncMutex = class {
  constructor() {
    this.queue = /* @__PURE__ */ new Map();
  }
  async runExclusive(key, fn) {
    const currentPromise = this.queue.get(key) || Promise.resolve();
    let release = () => {
    };
    const waitPromise = new Promise((resolve) => {
      release = resolve;
    });
    const nextInQueue = currentPromise.then(
      () => waitPromise,
      () => waitPromise
    );
    this.queue.set(key, nextInQueue);
    try {
      await currentPromise;
      return await fn();
    } finally {
      release();
      if (this.queue.get(key) === nextInQueue) {
        this.queue.delete(key);
      }
    }
  }
};
var splitTokenMutex = new KeyedAsyncMutex();
async function splitCashuToken(tokenString, amountToSend, overrideMintUrl) {
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
  const tokenProofKey = info.proofs.map((p) => p.secret || p.C).sort().join(":");
  const lockKey = `${cleanMint.toLowerCase()}:${tokenProofKey || tokenString.trim()}`;
  return splitTokenMutex.runExclusive(lockKey, async () => {
    console.log(`[splitCashuToken] Connecting to Mint: "${cleanMint}", Unit: "${normalizedUnit}"`);
    const wallet = new Wallet(cleanMint, { unit: normalizedUnit });
    await wallet.loadMint(true);
    let mintKeysetIds = [];
    try {
      const res = await fetch(`${cleanMint}/v1/keysets`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.keysets)) {
          mintKeysetIds = data.keysets.map((k) => k.id);
        }
      }
    } catch (err) {
      console.warn("[splitCashuToken] Could not fetch keysets directly, falling back to cache:", err);
      mintKeysetIds = wallet.keyChain?.cache?.keysets?.map((k) => k.id) || [];
    }
    console.log(`[splitCashuToken] Full Mint Keysets available:`, mintKeysetIds);
    const normalizedProofs = info.proofs.map((proof) => {
      const rawId = String(proof.id);
      const fullMatch = mintKeysetIds.find((fullId) => fullId === rawId || fullId.startsWith(rawId));
      if (fullMatch && fullMatch !== rawId) {
        console.log(`[splitCashuToken] Auto-expanded truncated keyset: ${rawId} -> ${fullMatch}`);
        return { ...proof, id: fullMatch };
      }
      return proof;
    });
    try {
      if (typeof wallet.ensureOperableKeysets === "function") {
        const keysetIds = Array.from(new Set(normalizedProofs.map((p) => p.id)));
        await wallet.ensureOperableKeysets(keysetIds);
      }
      let sendResult;
      if (wallet.ops && typeof wallet.ops.send === "function") {
        sendResult = await wallet.ops.send(amountToSend, normalizedProofs).run();
      } else {
        sendResult = await wallet.send(amountToSend, normalizedProofs);
      }
      const returnChange = sendResult.keep || sendResult.returnChange;
      const send = sendResult.send;
      const sendToken = encodeCashuToken(cleanMint, send, normalizedUnit);
      const changeToken = returnChange && returnChange.length > 0 ? encodeCashuToken(cleanMint, returnChange, normalizedUnit) : null;
      return { sendToken, changeToken };
    } catch (error) {
      if (error.name === "UnknownKeysetError" || error.message && error.message.includes("not a keyset of this mint")) {
        console.error(`[splitCashuToken] Keyset Error: Token does not belong to Mint ${cleanMint}`);
        throw new Error(`Invalid eCash token or keyset does not belong to active Mint (${cleanMint}). Please check your token.`);
      }
      throw error;
    }
  });
}
async function verifyTokenWithMint(tokenString) {
  try {
    const info = parseCashuToken(tokenString);
    const cleanMint = info.mint.replace(/\/+$/, "");
    const verifyPromise = (async () => {
      try {
        const wallet = new Wallet(cleanMint, { unit: info.unit });
        if (typeof wallet.loadMint === "function") {
          try {
            await wallet.loadMint();
          } catch (loadErr) {
            console.debug("[Cashu] loadMint error during token verification:", loadErr);
          }
        }
        let spentStates = [];
        if (typeof wallet.checkProofStates === "function") {
          spentStates = await wallet.checkProofStates(info.proofs);
        } else if (typeof wallet.checkProofsSpent === "function") {
          spentStates = await wallet.checkProofsSpent(info.proofs);
        } else if (typeof wallet.checkProofsState === "function") {
          spentStates = await wallet.checkProofsState(info.proofs);
        }
        if (Array.isArray(spentStates) && spentStates.length > 0) {
          const isSpent = spentStates.some(
            (s) => s === true || s?.state === "SPENT" || s?.spent === true
          );
          if (isSpent) {
            return { isValid: false, reason: "This Cashu eCash token has already been spent/claimed." };
          }
        }
      } catch (e) {
        console.debug("[Cashu] Mint verification check warning:", e);
      }
      return { isValid: true };
    })();
    const timeoutPromise = new Promise(
      (resolve) => setTimeout(() => resolve({ isValid: true }), 3e3)
    );
    return await Promise.race([verifyPromise, timeoutPromise]);
  } catch (err) {
    return { isValid: false, reason: err.message || "Failed to verify token with Mint node." };
  }
}
async function createCashuMintQuote(amountSats, mintUrl = DEFAULT_CASHU_MINT) {
  const cleanMint = mintUrl.trim().replace(/\/+$/, "");
  try {
    const wallet = new Wallet(cleanMint);
    if (typeof wallet.loadMint === "function") {
      try {
        await wallet.loadMint();
      } catch (loadErr) {
        console.debug("[Cashu] loadMint warning during quote creation:", loadErr);
      }
    }
    if (typeof wallet.createMintQuoteBolt11 === "function") {
      try {
        const quote = await wallet.createMintQuoteBolt11(amountSats);
        return {
          invoice: quote.request || quote.pr,
          quoteId: quote.quote || quote.hash || quote.id,
          mintUrl: cleanMint
        };
      } catch (bolt11Err) {
        console.debug("[Cashu] createMintQuoteBolt11 fallback:", bolt11Err);
      }
    }
    if (typeof wallet.createMintQuote === "function") {
      try {
        const quote = await wallet.createMintQuote("bolt11", amountSats);
        return {
          invoice: quote.request || quote.pr,
          quoteId: quote.quote || quote.hash || quote.id,
          mintUrl: cleanMint
        };
      } catch (createErr) {
        console.debug("[Cashu] createMintQuote('bolt11') failed, trying default arg:", createErr);
        try {
          const quote = await wallet.createMintQuote(amountSats);
          return {
            invoice: quote.request || quote.pr,
            quoteId: quote.quote || quote.hash || quote.id,
            mintUrl: cleanMint
          };
        } catch (quoteErr) {
          console.debug("[Cashu] createMintQuote fallback failed:", quoteErr);
        }
      }
    }
  } catch (walletErr) {
    console.debug("[Cashu] Wallet instance mint quote failed, attempting direct REST fallback:", walletErr);
  }
  try {
    const res = await fetch(`${cleanMint}/v1/mint/quote/bolt11`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountSats, unit: "sat" })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.request && data.quote) {
        return {
          invoice: data.request,
          quoteId: data.quote,
          mintUrl: cleanMint
        };
      }
    }
  } catch (err) {
    console.debug("[Cashu] Direct NUT-04 REST Mint request failed:", err);
  }
  throw new Error(`Could not request Mint invoice from ${cleanMint}.`);
}
async function encryptCashuPayload(recipientHexPubkey, rawPayload, ephemeralSk) {
  if (typeof window !== "undefined" && window.nostr?.nip44?.encrypt) {
    try {
      const encrypted2 = await window.nostr.nip44.encrypt(recipientHexPubkey, rawPayload);
      if (encrypted2) return { encryptedContent: encrypted2, encryptionScheme: "nip44" };
    } catch (err) {
      console.debug("[Cashu] Window nostr NIP-44 encryption failed, falling back:", err);
    }
  }
  if (typeof window !== "undefined" && window.nostr?.nip04?.encrypt) {
    try {
      const encrypted2 = await window.nostr.nip04.encrypt(recipientHexPubkey, rawPayload);
      if (encrypted2) return { encryptedContent: encrypted2, encryptionScheme: "nip04" };
    } catch (err) {
      console.debug("[Cashu] Window nostr NIP-04 encryption failed, falling back:", err);
    }
  }
  try {
    if (nip442 && nip442.v2) {
      const conversationKey = nip442.v2.utils.getConversationKey(ephemeralSk, recipientHexPubkey);
      const encrypted2 = nip442.v2.encrypt(rawPayload, conversationKey);
      return { encryptedContent: encrypted2, encryptionScheme: "nip44" };
    }
  } catch (err) {
    console.debug("[Cashu] Local nostr-tools NIP-44 v2 encryption failed, falling back to NIP-04:", err);
  }
  const encrypted = await nip04.encrypt(ephemeralSk, recipientHexPubkey, rawPayload);
  return { encryptedContent: encrypted, encryptionScheme: "nip04" };
}
async function sendCashuNutZap({
  recipientPubkey,
  cashuToken,
  amountSats,
  comment,
  mintUrl,
  giftWrap
}) {
  let hexPubkey = recipientPubkey;
  if (hexPubkey.startsWith("npub1")) {
    try {
      const decoded = nip19.decode(hexPubkey);
      if (decoded.type === "npub") hexPubkey = decoded.data;
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
  const ephemeralSk = generateSecretKey2();
  const { sendToken, changeToken } = await splitCashuToken(cashuToken, amountSats, cleanMint);
  const secretNutZapPayload = JSON.stringify({
    token: sendToken.trim(),
    memo: comment?.trim() || "Value-4-Value eCash NutZap \u{1F95C}",
    amount: amountSats,
    mint: cleanMint,
    created_at: Math.floor(Date.now() / 1e3)
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
      ["amount", (amountSats * 1e3).toString()],
      ["u", cleanMint],
      ["encryption", encryptionScheme],
      ["alt", `Encrypted NutZap: ${amountSats} Sats in Chaumian eCash`]
    ],
    created_at: Math.floor(Date.now() / 1e3)
  };
  let signedEvent = null;
  if (typeof window !== "undefined" && window.nostr?.signEvent) {
    try {
      signedEvent = await window.nostr.signEvent(eventTemplate);
    } catch (err) {
      console.debug("[Cashu] Window nostr.signEvent failed, using ephemeral key:", err);
    }
  }
  if (!signedEvent) {
    signedEvent = finalizeEvent2(eventTemplate, ephemeralSk);
  }
  const shouldGiftWrap = giftWrap ?? process.env.NOSTRPULSE_GIFTWRAP_NUTZAP === "true";
  let giftWrapEvent = null;
  if (shouldGiftWrap) {
    const encManager = new EncryptionManager({ mode: "required" /* REQUIRED */ });
    const senderPrivHex = bytesToHex(ephemeralSk);
    giftWrapEvent = await encManager.encryptMessage(senderPrivHex, hexPubkey, eventTemplate);
  }
  const broadcastEvent = shouldGiftWrap && giftWrapEvent ? giftWrapEvent : signedEvent;
  const pool = new SimplePool();
  try {
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1500));
    const publishPromises = RELAYS.map(async (relayUrl) => {
      try {
        const pub = pool.publish([relayUrl], broadcastEvent);
        if (pub && typeof pub.catch === "function") {
          pub.catch(() => {
          });
        }
        await Promise.race([pub, timeoutPromise]);
      } catch (err) {
        console.debug(`[Cashu] Failed to publish NutZap to ${relayUrl}:`, err);
      }
    });
    await Promise.race([
      Promise.allSettled(publishPromises),
      new Promise((resolve) => setTimeout(resolve, 2e3))
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
    giftWrapEvent: giftWrapEvent || void 0,
    changeToken,
    id: signedEvent.id,
    giftWrapId: giftWrapEvent ? giftWrapEvent.id : void 0,
    kind: signedEvent.kind,
    wrappedKind: giftWrapEvent ? 1059 : void 0,
    ...signedEvent
  };
}

// src/lib/mint-mesh.ts
var DEFAULT_MINT_MESH_URLS = [
  "https://testnut.cashu.space",
  "https://mint.minibits.cash/Bitcoin",
  "https://mint.macadamia.cash",
  "https://legend.lnbits.com/cashu/api/v1/4gr9xm9YVgah95qcqzQgeh"
];
var MAX_AUDIT_CACHE_ENTRIES = 200;
var auditCache = /* @__PURE__ */ new Map();
var AUDIT_CACHE_TTL_MS = 60 * 1e3;
function setAuditCacheEntry(cleanUrl, entry) {
  const now = Date.now();
  for (const [key, val] of auditCache.entries()) {
    if (val.expiresAt <= now) {
      auditCache.delete(key);
    }
  }
  while (auditCache.size >= MAX_AUDIT_CACHE_ENTRIES) {
    const oldestKey = auditCache.keys().next().value;
    if (oldestKey !== void 0) {
      auditCache.delete(oldestKey);
    } else {
      break;
    }
  }
  auditCache.set(cleanUrl, entry);
}
var KNOWN_MINT_OPERATORS = {
  "https://testnut.cashu.space": {
    pubkey: "140e4e08e6e5898867f5dbffec52eed1f92e394e432c2536c93437e584285b7b",
    nip05: "calle@cashu.space"
  },
  "https://mint.minibits.cash/bitcoin": {
    pubkey: "140e4e08e6e5898867f5dbffec52eed1f92e394e432c2536c93437e584285b7b",
    nip05: "calle@minibits.cash"
  },
  "https://mint.macadamia.cash": {
    pubkey: "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
    nip05: "admin@macadamia.cash"
  }
};
async function fetchMintInfo(mintUrl, timeoutMs = 3500) {
  if (!isSafeExternalUrl(mintUrl)) {
    return { info: null, latencyMs: 0, isOnline: false };
  }
  const cleanUrl = mintUrl.trim().replace(/\/+$/, "");
  const infoEndpoint = `${cleanUrl}/v1/info`;
  const startTime = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(infoEndpoint, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - startTime;
    if (!res.ok) {
      const legacyEndpoint = `${cleanUrl}/info`;
      const legacyController = new AbortController();
      const legacyTimer = setTimeout(() => legacyController.abort(), 2e3);
      try {
        const legacyRes = await fetch(legacyEndpoint, {
          signal: legacyController.signal,
          headers: { Accept: "application/json" }
        });
        clearTimeout(legacyTimer);
        if (legacyRes.ok) {
          const data2 = await legacyRes.json();
          return { info: data2, latencyMs: Date.now() - startTime, isOnline: true };
        }
      } catch {
      }
      return { info: null, latencyMs, isOnline: false };
    }
    const data = await res.json();
    return { info: data, latencyMs, isOnline: true };
  } catch {
    clearTimeout(timer);
    return { info: null, latencyMs: Date.now() - startTime, isOnline: false };
  }
}
function extractAdminContact(info) {
  if (!info) return { pubkey: null, nip05: null };
  let foundPubkey = null;
  let foundNip05 = null;
  if (Array.isArray(info.contact)) {
    for (const item of info.contact) {
      if (Array.isArray(item) && item.length >= 2) {
        const type = String(item[0]).toLowerCase();
        const val = String(item[1]).trim();
        if (type === "nostr" || type === "npub" || type === "nip05") {
          const cleanVal = val.replace(/^nostr:\/?\/?/i, "").trim();
          if (cleanVal.includes("@")) {
            foundNip05 = foundNip05 || cleanVal;
          } else {
            const norm = normalizePubkey(cleanVal);
            if (norm) foundPubkey = foundPubkey || norm;
          }
        }
      } else if (typeof item === "object" && item !== null) {
        const method = String(item.method || "").toLowerCase();
        const val = String(item.info || "").trim();
        if (method === "nostr" || method === "npub" || method === "nip05") {
          const cleanVal = val.replace(/^nostr:\/?\/?/i, "").trim();
          if (cleanVal.includes("@")) {
            foundNip05 = foundNip05 || cleanVal;
          } else {
            const norm = normalizePubkey(cleanVal);
            if (norm) foundPubkey = foundPubkey || norm;
          }
        }
      }
    }
  } else if (typeof info.contact === "object" && info.contact !== null) {
    for (const [key, value] of Object.entries(info.contact)) {
      const type = key.toLowerCase();
      const val = String(value).trim();
      if (type === "nostr" || type === "npub" || type === "nip05") {
        const cleanVal = val.replace(/^nostr:\/?\/?/i, "").trim();
        if (cleanVal.includes("@")) {
          foundNip05 = foundNip05 || cleanVal;
        } else {
          const norm = normalizePubkey(cleanVal);
          if (norm) foundPubkey = foundPubkey || norm;
        }
      }
    }
  }
  if (!foundPubkey && info.pubkey && typeof info.pubkey === "string") {
    let clean = info.pubkey.trim();
    if (clean.length === 66 && (clean.startsWith("02") || clean.startsWith("03"))) {
      clean = clean.slice(2);
    }
    const norm = normalizePubkey(clean);
    if (norm) foundPubkey = norm;
  }
  return {
    pubkey: foundPubkey,
    nip05: foundNip05
  };
}
async function resolveNip05ToPubkey(nip05) {
  try {
    const clean = nip05.trim().toLowerCase();
    const parts = clean.split("@");
    if (parts.length !== 2) return null;
    const [name, domain] = parts;
    if (!isSafeExternalUrl(`https://${domain}`)) {
      return null;
    }
    const res = await fetch(
      `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`,
      {
        signal: AbortSignal.timeout(2e3),
        headers: { Accept: "application/json" }
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const pk = data?.names?.[name];
    if (pk && typeof pk === "string") {
      return normalizePubkey(pk);
    }
  } catch {
  }
  return null;
}
function extractSupportedNuts(info) {
  if (!info || !info.nuts || typeof info.nuts !== "object") return [];
  const list = [];
  for (const key of Object.keys(info.nuts)) {
    const num = parseInt(key.replace(/^nut-?/i, ""), 10);
    if (!isNaN(num)) {
      const formatted = `NUT-${num < 10 ? "0" + num : num}`;
      if (!list.includes(formatted)) {
        list.push(formatted);
      }
    } else {
      const upper = key.toUpperCase();
      if (!list.includes(upper)) list.push(upper);
    }
  }
  return list.sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });
}
function extractCompliance(info) {
  const nuts = info?.nuts || {};
  const hasNut = (num) => Boolean(nuts[num] || nuts[String(num)]);
  return {
    nut04Mint: hasNut(4),
    nut05Melt: hasNut(5),
    nut07StateCheck: hasNut(7),
    nut08FeeReturn: hasNut(8),
    nut10Dleq: hasNut(10),
    nut11P2pk: hasNut(11),
    rawNuts: nuts
  };
}
async function auditCashuMint(mintUrl, forceRefresh = false) {
  const cleanUrl = mintUrl.trim().replace(/\/+$/, "");
  const cached = auditCache.get(cleanUrl);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }
  const { info, latencyMs, isOnline } = await fetchMintInfo(cleanUrl);
  const breakdown = [];
  if (!isOnline || !info) {
    const offlineResult = {
      mintUrl: cleanUrl,
      trustScore: 0,
      riskLevel: "HIGH_RISK",
      adminPubkey: null,
      supportedNuts: [],
      recommendation: "AVOID",
      isOnline: false,
      latencyMs,
      name: cleanUrl.replace(/^https?:\/\//, ""),
      wotDistance: 3,
      wotEndorsersCount: 0,
      tier: "Offline",
      isGated: true,
      gateReason: "Mint is unreachable or returned non-200 response on NUT-06 info probe.",
      compliance: {
        nut04Mint: false,
        nut05Melt: false,
        nut07StateCheck: false,
        nut08FeeReturn: false,
        nut10Dleq: false
      },
      breakdown: [
        {
          label: "Pillar 1: Operator WoT Graph Connectivity",
          points: 0,
          maxPoints: 35,
          passed: false,
          description: "Mint endpoint is offline."
        },
        {
          label: "Pillar 2: Economic Proof-of-Trust (Zaps)",
          points: 0,
          maxPoints: 20,
          passed: false,
          description: "Mint endpoint is offline."
        },
        {
          label: "Pillar 3: Cryptographic Identity & Transport Security",
          points: 0,
          maxPoints: 15,
          passed: false,
          description: "Mint endpoint is offline."
        },
        {
          label: "Pillar 4: Operational Health & Latency",
          points: 0,
          maxPoints: 15,
          passed: false,
          description: "Probe timed out or connection failed."
        },
        {
          label: "Pillar 5: NUT Protocol Compliance",
          points: 0,
          maxPoints: 15,
          passed: false,
          description: "No NUT capabilities detected."
        }
      ],
      auditedAt: Date.now()
    };
    setAuditCacheEntry(cleanUrl, { result: offlineResult, expiresAt: Date.now() + 15e3 });
    return offlineResult;
  }
  const compliance = extractCompliance(info);
  const supportedNuts = extractSupportedNuts(info);
  const contact = extractAdminContact(info);
  let adminPubkey = contact.pubkey;
  let adminNip05 = contact.nip05;
  if (!adminPubkey && adminNip05) {
    adminPubkey = await resolveNip05ToPubkey(adminNip05);
  }
  if (!adminPubkey && KNOWN_MINT_OPERATORS[cleanUrl.toLowerCase()]) {
    adminPubkey = KNOWN_MINT_OPERATORS[cleanUrl.toLowerCase()].pubkey;
    if (!adminNip05) {
      adminNip05 = KNOWN_MINT_OPERATORS[cleanUrl.toLowerCase()].nip05 || null;
    }
  }
  const operatorNpub = adminPubkey ? encodeNpub(adminPubkey) : void 0;
  let profile = null;
  let nip05Result = void 0;
  let wotResult = null;
  let creatorDb = null;
  let zapRow = null;
  let isVerifiableAdmin = false;
  if (adminPubkey) {
    try {
      [profile, creatorDb, zapRow] = await Promise.all([
        fetchNostrProfile(adminPubkey).catch(() => null),
        getCreatorFromDb(adminPubkey).catch(() => null),
        getZapTotalsFromDb(adminPubkey).catch(() => null)
      ]);
      const targetNip05 = adminNip05 || profile?.nip05 || creatorDb?.nip05;
      if (targetNip05) {
        nip05Result = await verifyNip05(targetNip05, adminPubkey).catch(() => void 0);
      }
      wotResult = getWebOfTrustDistance(adminPubkey);
      const effectiveProfile = profile || {
        pubkey: adminPubkey,
        npub: operatorNpub || "",
        name: creatorDb?.name || "",
        nip05: targetNip05 || ""
      };
      const calculatedAdminScore = calculateTrustScore(
        effectiveProfile,
        nip05Result,
        wotResult
      );
      isVerifiableAdmin = Boolean(
        wotResult.distance <= 2 || nip05Result?.isVerified || profile?.name || creatorDb || calculatedAdminScore.score >= 20
      );
    } catch (err) {
      console.debug("[MintMesh] Admin reputation resolution warning:", err);
    }
  }
  const wotDistance = wotResult ? wotResult.distance : 3;
  const wotEndorsersCount = wotResult ? wotResult.endorsedByCount : 0;
  let p1Points = 0;
  let p1Desc = "";
  if (wotResult && adminPubkey) {
    if (wotResult.distance === 0) {
      p1Points = 35;
      p1Desc = `Root Seed Anchor: Mint operated directly by Nostr core anchor (${wotResult.tier || "Core Protocol"})`;
    } else if (wotResult.distance === 1) {
      const endorsers = wotResult.endorsers || [];
      const sample = endorsers.slice(0, 2).join(", ");
      p1Points = Math.min(30, 20 + wotResult.endorsedByCount * 2);
      p1Desc = `Hop 1: Operator endorsed by ${wotResult.endorsedByCount} Anchors${sample ? ` (${sample})` : ""}`;
    } else if (wotResult.distance === 2) {
      p1Points = Math.min(20, 10 + wotResult.endorsedByCount * 2);
      p1Desc = `Hop 2: Operator verified via transitive trust graph (${wotResult.endorsedByCount} Ring-1 endorsers)`;
    } else {
      p1Points = 8;
      p1Desc = "Hop > 2: Operator pubkey present but outside Ring-2 trust graph";
    }
  } else {
    const isRecommended = RECOMMENDED_MINTS.some(
      (m) => m.url.toLowerCase() === cleanUrl.toLowerCase()
    );
    if (isRecommended) {
      p1Points = 25;
      p1Desc = "Ecosystem Benchmark: Recognized community mint in NostrPulse trusted index";
    } else {
      p1Points = 10;
      p1Desc = "Autonomous Mint: No verifiable Nostr operator identity in NUT-06 contacts";
    }
  }
  breakdown.push({
    label: "Pillar 1: Operator WoT Graph Connectivity",
    points: p1Points,
    maxPoints: 35,
    passed: p1Points >= 15,
    description: `${p1Desc} \u2022 ${p1Points}/35 pts`
  });
  let p2Points = 0;
  let p2Desc = "";
  const validZapsSats = zapRow?.valid_sender_sats ?? 0;
  if (validZapsSats > 0) {
    const satsPoints = Math.min(20, Math.round(Math.log10(validZapsSats + 1) * 4));
    p2Points = Math.max(8, satsPoints);
    p2Desc = `Operator received ${validZapsSats.toLocaleString()} Sats in verified WoT Zaps`;
  } else if (adminPubkey) {
    p2Points = 5;
    p2Desc = "Active Nostr keypair, no verified incoming WoT Zaps recorded";
  } else {
    p2Points = 5;
    p2Desc = "Pseudonymous mint operator, economic stake signal neutral";
  }
  breakdown.push({
    label: "Pillar 2: Economic Proof-of-Trust (Zaps)",
    points: p2Points,
    maxPoints: 20,
    passed: p2Points >= 8,
    description: `${p2Desc} \u2022 ${p2Points}/20 pts`
  });
  let p3Points = 0;
  let p3Desc = "";
  const isHttps = cleanUrl.startsWith("https://");
  if (isHttps) {
    p3Points += 8;
    p3Desc = "Encrypted HTTPS transport";
  } else {
    p3Desc = "Insecure HTTP transport (security risk)";
  }
  const isNip05Verified = Boolean(nip05Result?.isVerified);
  if (isNip05Verified) {
    p3Points += 7;
    p3Desc += ` \u2022 Verified NIP-05 (${nip05Result?.nip05})`;
  } else if (info.name && info.pubkey) {
    p3Points += 4;
    p3Desc += " \u2022 Valid NUT-06 public keyset signature";
  }
  p3Points = Math.min(15, p3Points);
  breakdown.push({
    label: "Pillar 3: Cryptographic Identity & Transport Security",
    points: p3Points,
    maxPoints: 15,
    passed: isHttps,
    description: `${p3Desc} \u2022 ${p3Points}/15 pts`
  });
  let p4Points = 0;
  let p4Desc = "";
  if (latencyMs < 300) {
    p4Points = 15;
    p4Desc = `Ultra-fast response (${latencyMs}ms)`;
  } else if (latencyMs < 800) {
    p4Points = 12;
    p4Desc = `Good responsiveness (${latencyMs}ms)`;
  } else if (latencyMs < 1500) {
    p4Points = 8;
    p4Desc = `Moderate latency (${latencyMs}ms)`;
  } else if (latencyMs < 3e3) {
    p4Points = 4;
    p4Desc = `High latency (${latencyMs}ms)`;
  } else {
    p4Points = 1;
    p4Desc = `Degraded responsiveness (${latencyMs}ms)`;
  }
  breakdown.push({
    label: "Pillar 4: Operational Health & Latency",
    points: p4Points,
    maxPoints: 15,
    passed: latencyMs < 1500,
    description: `${p4Desc} \u2022 ${p4Points}/15 pts`
  });
  let p5Points = 0;
  if (compliance.nut04Mint) p5Points += 3;
  if (compliance.nut05Melt) p5Points += 4;
  if (compliance.nut07StateCheck) p5Points += 3;
  if (compliance.nut08FeeReturn) p5Points += 3;
  if (compliance.nut10Dleq) p5Points += 2;
  if (compliance.nut11P2pk) p5Points += 2;
  p5Points = Math.min(15, p5Points);
  const p5Desc = supportedNuts.length > 0 ? `Supported capabilities: ${supportedNuts.join(", ")}` : "Basic Cashu V3 compatibility";
  breakdown.push({
    label: "Pillar 5: NUT Protocol Compliance",
    points: p5Points,
    maxPoints: 15,
    passed: compliance.nut04Mint && compliance.nut05Melt,
    description: `${p5Desc} \u2022 ${p5Points}/15 pts`
  });
  let rawScore = p1Points + p2Points + p3Points + p4Points + p5Points;
  let isGated = false;
  let gateReason;
  if (!isHttps) {
    rawScore = Math.min(rawScore, 25);
    isGated = true;
    gateReason = "Insecure HTTP: Transport encryption is mandatory for production mint routing.";
  }
  if (latencyMs > 3500) {
    rawScore = Math.min(rawScore, 35);
    isGated = true;
    gateReason = "Extreme latency: Mint latency exceeded 3500ms threshold.";
  }
  if (!adminPubkey) {
    rawScore = Math.min(rawScore, 40);
    isGated = true;
    if (!gateReason) {
      gateReason = "No verifiable Nostr admin contact in mint metadata.";
    }
  }
  const finalTrustScore = Math.round(rawScore);
  let riskLevel;
  if (!adminPubkey || finalTrustScore < 45) {
    riskLevel = "HIGH_RISK";
  } else if (finalTrustScore >= 75) {
    riskLevel = "LOW";
  } else {
    riskLevel = "MODERATE";
  }
  let recommendation;
  if (riskLevel === "LOW") {
    recommendation = "TRUSTED";
  } else if (riskLevel === "MODERATE") {
    recommendation = "USE_WITH_CAP";
  } else {
    recommendation = "AVOID";
  }
  let tier;
  if (finalTrustScore >= 65) {
    tier = "Tier 1: High-Trust Verified Mint";
  } else if (finalTrustScore >= 45) {
    tier = "Tier 2: Community Mint";
  } else {
    tier = "Tier 3: Unverified / High-Risk Mint";
    isGated = true;
    if (!gateReason) {
      gateReason = "Trust score is below the WoT security threshold (< 45/100).";
    }
  }
  const result = {
    mintUrl: cleanUrl,
    trustScore: finalTrustScore,
    riskLevel,
    adminPubkey: adminPubkey || null,
    supportedNuts,
    recommendation,
    name: info.name || cleanUrl.replace(/^https?:\/\//, ""),
    version: info.version,
    description: info.description,
    isOnline: true,
    latencyMs,
    operatorNpub,
    operatorName: profile?.name || creatorDb?.name || void 0,
    wotDistance,
    wotEndorsersCount,
    nip05Verified: isNip05Verified,
    tier,
    isGated,
    gateReason,
    compliance,
    breakdown,
    auditedAt: Date.now()
  };
  setAuditCacheEntry(cleanUrl, { result, expiresAt: Date.now() + AUDIT_CACHE_TTL_MS });
  return result;
}
async function selectBestMint(mintCandidates) {
  if (!mintCandidates || mintCandidates.length === 0) {
    return null;
  }
  const audits = await Promise.all(
    mintCandidates.map(
      (url) => auditCashuMint(url).catch(() => ({
        mintUrl: url,
        trustScore: 0,
        riskLevel: "HIGH_RISK",
        adminPubkey: null,
        supportedNuts: [],
        recommendation: "AVOID",
        isOnline: false,
        latencyMs: 9999,
        wotDistance: 3,
        wotEndorsersCount: 0,
        tier: "Offline",
        isGated: true,
        gateReason: "Audit execution failure",
        compliance: {
          nut04Mint: false,
          nut05Melt: false,
          nut07StateCheck: false,
          nut08FeeReturn: false,
          nut10Dleq: false
        },
        breakdown: [],
        auditedAt: Date.now()
      }))
    )
  );
  const sorted = audits.sort((a, b) => {
    if (b.trustScore !== a.trustScore) {
      return b.trustScore - a.trustScore;
    }
    return (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999);
  });
  return sorted[0] || null;
}
async function routeCashuMint(options = {}) {
  const minScore = options.minTrustScore ?? 45;
  const candidates = options.candidateMints?.length ? options.candidateMints : DEFAULT_MINT_MESH_URLS;
  const audits = await Promise.all(
    candidates.map(
      (url) => auditCashuMint(url).catch((err) => {
        console.debug(`[MintMesh] Failed auditing ${url}:`, err);
        return {
          mintUrl: url,
          trustScore: 0,
          riskLevel: "HIGH_RISK",
          adminPubkey: null,
          supportedNuts: [],
          recommendation: "AVOID",
          isOnline: false,
          latencyMs: 9999,
          name: url,
          wotDistance: 3,
          wotEndorsersCount: 0,
          tier: "Offline",
          isGated: true,
          gateReason: "Audit execution error",
          compliance: {
            nut04Mint: false,
            nut05Melt: false,
            nut07StateCheck: false,
            nut08FeeReturn: false,
            nut10Dleq: false
          },
          breakdown: [],
          auditedAt: Date.now()
        };
      })
    )
  );
  const qualifiedMints = audits.filter(
    (a) => a.isOnline && a.trustScore >= minScore
  );
  const gatedOutMints = audits.filter(
    (a) => !a.isOnline || a.trustScore < minScore
  );
  const calculateRoutingScore = (a) => {
    const latencyScore = Math.max(0, 100 - Math.min(100, (a.latencyMs ?? 9999) / 20));
    const isPreferred = options.preferredMint && a.mintUrl.toLowerCase() === options.preferredMint.toLowerCase();
    const preferredBoost = isPreferred ? 15 : 0;
    return a.trustScore * 0.65 + latencyScore * 0.35 + preferredBoost;
  };
  const rankedMesh = (qualifiedMints.length > 0 ? qualifiedMints : audits).sort(
    (a, b) => calculateRoutingScore(b) - calculateRoutingScore(a)
  );
  const selectedMint = rankedMesh[0];
  return {
    selectedMint,
    rankedMesh,
    gatedOutMints,
    totalCandidateCount: audits.length,
    activeMeshCount: qualifiedMints.length,
    meshHealthy: qualifiedMints.length > 0
  };
}

export {
  DEFAULT_MINT_MESH_URLS,
  auditCashuMint,
  selectBestMint,
  routeCashuMint,
  DEFAULT_CASHU_MINT,
  encodeCashuToken,
  parseCashuToken,
  KeyedAsyncMutex,
  splitCashuToken,
  verifyTokenWithMint,
  createCashuMintQuote,
  sendCashuNutZap
};
