/**
 * @nostrpulse/sdk
 *
 * NostrPulse Standalone SDK
 * Autonomous Payment & Sybil-Resistant Trust Layer for AI Agents & Bitcoin/Nostr Applications.
 *
 * Core Capabilities:
 * 1. RFC 8949 CBOR: 100% Zero-Buffer encoding & decoding.
 * 2. Web-of-Trust & Root Anchors: Multi-relay Hop 0/1/2 transitive graph distance.
 * 3. 5-Pillar Trust Score: Anti-Sybil reputation & economic stake evaluation.
 * 4. Cashu NIP-61 NutZaps & Dynamic Mint Mesh: eCash payments & counterparty risk audits.
 * 5. NIP-59 Gift Wrap Privacy: Timing jitter & metadata envelope encryption.
 * 6. NIP-47 NWC: Direct Lightning Network payment execution.
 * 7. Spending Guardrails & Identity: Policy enforcement & persistent agent key management.
 */

// =============================================================================
// 1. Zero-Buffer RFC 8949 CBOR & Binary Helpers
// =============================================================================
export {
  encodeCbor,
  decodeCbor,
  bytesToHex,
  hexToBytes,
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToBase64,
} from "../lib/cbor";

// =============================================================================
// 2. Web-of-Trust Graph & Root Seed Anchors
// =============================================================================
export {
  ROOT_ANCHORS,
  ANCHOR_PUBKEYS,
  isRootAnchor,
  getRootAnchor,
  getAnchorWeight,
} from "../lib/anchors";
export type { RootAnchor, AnchorTier } from "../lib/anchors";

export {
  normalizePubkey,
  encodeNpub,
  getWebOfTrustDistance,
  resolveWebOfTrustDistance,
  isVerifiedRing1,
  getWebOfTrustScore,
  getRing1CacheMetadata,
  queryLiveContactListWithTimeout,
} from "../lib/wot";
export type { WebOfTrustDistanceResult, Ring1CacheEntry } from "../lib/wot";

// =============================================================================
// 3. 5-Pillar Anti-Sybil Trust Score & Economic Stake
// =============================================================================
export {
  calculateTrustScore,
  calculateTrustScoreAsync,
} from "../lib/trust-score";
export type {
  TrustScoreResult,
  TrustScoreBreakdownItem,
  NostrProfile,
} from "../lib/trust-score";

export {
  fetchEconomicStake,
  parseZapReceipt,
} from "../lib/economic-stake";
export type {
  EconomicStakeResult,
  ParsedZapReceipt,
  ValidZapSender,
  FilteredZapSender,
} from "../lib/economic-stake";

export {
  verifyNip05,
} from "../lib/nip05";
export type { Nip05Result } from "../lib/nip05";

// =============================================================================
// 4. Cashu NIP-61 NutZaps & Dynamic Mint Mesh Routing
// =============================================================================
export {
  parseCashuToken,
  encodeCashuToken,
  splitCashuToken,
  verifyTokenWithMint,
  createCashuMintQuote,
  pollMintAndClaimToken,
  sendCashuNutZap,
  receiveAndUnwrapNutZap,
  isValidMintUrl,
  RECOMMENDED_MINTS,
  DEFAULT_CASHU_MINT,
  KeyedAsyncMutex,
  splitTokenMutex,
} from "../lib/cashu";
export type {
  CashuProof,
  DecodedCashuInfo,
  CashuMintOption,
} from "../lib/cashu";

export {
  auditCashuMint,
  selectBestMint,
  routeCashuMint,
  DEFAULT_MINT_MESH_URLS,
} from "../lib/mint-mesh";
export type {
  MintAuditResult,
  MintRiskProfile,
  MintNutCompliance,
  MintPillarBreakdown,
  DynamicMintRoutingResult,
} from "../lib/mint-mesh";

export {
  isSafeExternalUrl,
  isPrivateOrLocalHost,
} from "../lib/ssrf";

// =============================================================================
// 5. NIP-59 Gift Wrap Privacy & Ephemeral Metadata Encryption
// =============================================================================
export {
  EncryptionManager,
  EncryptionMode,
  GIFT_WRAP_KIND,
  SEALED_DIRECT_MESSAGE_KIND,
  PRIVATE_DIRECT_MESSAGE_KIND,
  NOTIFICATION_KIND,
} from "../lib/encryption";
export type {
  EncryptionConfig,
  EncryptOptions,
  DecryptedMessage,
} from "../lib/encryption";

// =============================================================================
// 6. NIP-47 Nostr Wallet Connect (NWC) Direct Lightning Rail
// =============================================================================
export {
  payWithNWC,
  parseNWCUri,
  formatNWCUri,
  isNWCConfigured,
  getNWCInfo,
  getNWCBalance,
  makeNWCInvoice,
  executeNWCRequest,
} from "../lib/nwc";
export type {
  NWCConnectionConfig,
  PayWithNWCOptions,
  NWCPaymentResult,
  NWCRequestOptions,
  NWCResponseResult,
} from "../lib/nwc";

// =============================================================================
// 7. Autonomous Spending Guardrails & Zero-Config Identity
// =============================================================================
export {
  getSpendingPolicy,
  updateSpendingPolicy,
  assertSpendingAllowed,
  getRolling24hSpend,
  resolveRecipientTrustScore,
} from "../lib/guardrails";
export type {
  SpendingPolicy,
  SpendingValidationParams,
  SpendingValidationResult,
} from "../lib/guardrails";

export {
  getOrInitAgentIdentity,
  getAgentPubkey,
  getAgentNpub,
  clearAgentIdentityCache,
} from "../lib/identity-manager";
export type {
  AgentIdentity,
  StoredIdentityFile,
} from "../lib/identity-manager";
