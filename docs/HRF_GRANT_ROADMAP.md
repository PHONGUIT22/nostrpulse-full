# Human Rights Foundation (HRF) Bitcoin Development Fund — Project Roadmap & Verification

**Project:** NostrPulse (`@nostrpulse/sdk` & `nostrpulse-mcp`)  
**Mission:** Autonomous Value-4-Value Payment & Sybil-Resistant Trust Layer for AI Agents & Bitcoin/Nostr Applications.  
**Grant Application:** HRF Bitcoin Development Fund  
**Specification Version:** v1.2.0  

---

## 🎯 Executive Summary & Milestone Deliverables

NostrPulse bridges the gap between autonomous AI agents and open Bitcoin/Nostr financial rails. By delivering zero-buffer RFC 8949 CBOR encoding, transitive Web-of-Trust anti-Sybil graph defense, Chaumian eCash (Cashu NUTs), NIP-59 Gift Wrap metadata privacy, and strict autonomous spending guardrails, NostrPulse empowers AI agents to safely transact and verify identities across the globe.

Below is the verified audit and milestone status tracking:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   NOSTRPULSE ARCHITECTURE                              │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│   Month 1: Core SDK      │  Month 2: Payments & Mesh   │   Month 3: WoT & Hardening    │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ • Zero-Buffer RFC 8949   │ • Cashu NIP-61 NutZaps      │ • Multi-Relay Hop-2 WoT Graph │
│ • Standalone SDK Entry   │ • Dynamic Mint Mesh Routing │ • SSRF Protection & Mutexes   │
│ • NIP-59 Timing Jitter   │ • Spending Guardrails & NWC │ • Unified CI/CD Test Runner   │
│ • Zero Node Buffer Dep   │ • Persistent Identity Store │ • MCP Profiles & DVM Worker   │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

---

## 📅 Milestone 1: Standalone SDK & Zero-Dependency RFC 8949 CBOR

**Status:** Completed (100% Passed)

### Key Deliverables & Implementation
1. **Zero-Buffer RFC 8949 CBOR Engine ([`src/lib/cbor.ts`](../src/lib/cbor.ts))**:
   - Zero-dependency implementation written strictly using `Uint8Array`, `DataView`, `TextEncoder`, and `TextDecoder`.
   - 100% free of Node.js `Buffer` objects, enabling native execution across Browser, Edge Workers, Deno, Bun, and Node.js.
   - Comprehensive Major Types support: Unsigned Ints (Type 0), Negative Ints (Type 1), Byte Strings (Type 2), UTF-8 Unicode Strings (Type 3), Arrays (Type 4), Maps (Type 5), and Primitives (Type 7).
   - Fast lookup-table Base64 and Base64URL codecs.

2. **Standalone SDK Entry Point ([`src/sdk/index.ts`](../src/sdk/index.ts))**:
   - Packaged as clean, tree-shakeable library exports (`@nostrpulse/sdk`).
   - Exporting 60+ core types and functions across WoT, Trust Score, Cashu, NIP-59, NWC, and Guardrails.
   - Dual build pipeline configured via [`tsup.config.ts`](../tsup.config.ts) and [`package.json`](../package.json) `"exports"` (`.` -> MCP entry, `./sdk` -> SDK entry).

3. **NIP-59 Metadata Privacy & Timestamp Jitter ([`src/lib/encryption.ts`](../src/lib/encryption.ts))**:
   - Upgraded `EncryptionManager` supporting NIP-59 Gift Wrap (Kind 1059) and Seal (Kind 13).
   - Added randomized timestamp obfuscation (`jitterSeconds` up to 48 hours) to prevent relay-level timing correlation attacks against transaction senders and recipients.

### Verification Commands
```bash
# Verify Zero-Buffer CBOR & NIP-59 Gift Wrap NutZaps
npx tsx scripts/test-cbor-and-giftwrap-nutzap.ts
```

---

## 📅 Milestone 2: Dynamic Multi-Mint Cashu NutZap Routing & Spending Guardrails

**Status:** Completed (100% Passed)

### Key Deliverables & Implementation
1. **NIP-61 Cashu NutZap Payments ([`src/lib/cashu.ts`](../src/lib/cashu.ts))**:
   - Supports both legacy `cashuA` (V3 JSON) and modern `cashuB` (V4 CBOR) token formats.
   - Automatic truncated Keyset ID expansion (16-char CBOR prefix -> full 66-char keyset ID).
   - `sendCashuNutZap` with optional `giftWrap: true` envelope hiding `amount`, mint URL `u`, and sender pubkey from relays.
   - `receiveAndUnwrapNutZap` for recipient-side eCash claiming.

2. **WoT-Gated Dynamic Mint Mesh Routing ([`src/lib/mint-mesh.ts`](../src/lib/mint-mesh.ts))**:
   - Probes NUT-06 `/v1/info` endpoints for operational health, keysets, and protocol compliance (NUT-04 through NUT-20).
   - Audits mint operator Nostr identity via 5-Pillar counterparty risk analysis:
     - Pillar 1: Operator WoT Graph Distance
     - Pillar 2: Economic Stake (WoT Zaps received)
     - Pillar 3: Cryptographic Identity & Transport (HTTPS, NIP-05)
     - Pillar 4: Operational Health & Probe Latency
     - Pillar 5: NUT Protocol Compliance
   - Dynamic mint ranking via `selectBestMint` and `routeCashuMint`.

3. **Autonomous Spending Guardrails & Identity Keystore ([`src/lib/guardrails.ts`](../src/lib/guardrails.ts) & [`src/lib/identity-manager.ts`](../src/lib/identity-manager.ts))**:
   - Policy controls protecting AI agent wallets: single transaction cap (`AGENT_MAX_SATS_PER_TX`), rolling 24-hour limit (`AGENT_DAILY_LIMIT_SATS`), and recipient anti-Sybil gate (`AGENT_MIN_RECIPIENT_SCORE`).
   - SQLite-backed tamper-evident transaction audit trail (`agent_spending_log`).
   - Zero-config agent key management persisting to `.nostrpulse/agent-identity.json`.

4. **NIP-47 Nostr Wallet Connect (NWC) Direct Lightning Rail ([`src/lib/nwc.ts`](../src/lib/nwc.ts))**:
   - Parse and format standard `nostr+walletconnect://` URIs.
   - NIP-04 / NIP-44 request encryption with strict timeout and subscription cleanup.

### Verification Commands
```bash
# Verify Spending Guardrails & Budget Policy
npx tsx scripts/test-guardrails-policy.ts

# Verify Agent Identity Keystore & Spending Caps
npx tsx scripts/test-guardrails.ts

# Verify Dynamic Mint Mesh Auditing & Routing
npx tsx scripts/test-mint-mesh.ts

# Verify NIP-47 NWC Lightning Rails
npx tsx scripts/test-nwc.ts
```

---

## 📅 Milestone 3: Multi-Relay Transitive WoT, SSRF Security & Unified Test Suites

**Status:** Completed (100% Passed)

### Key Deliverables & Implementation
1. **Multi-Relay Hop-2 Transitive Web-of-Trust ([`src/lib/wot.ts`](../src/lib/wot.ts))**:
   - 4-Tier WoT Graph Classification:
     - Hop 0: Root Seed Anchors (Nostr core developers, protocol contributors)
     - Hop 1: Direct Trust Endorsement from Anchors (Ring-1 Snapshot)
     - Hop 2: Transitive Trust via >= 1 Ring-1 node (dynamic multi-relay reverse follower resolution)
     - Hop 3: Unknown / Isolated keypairs (High Sybil risk)
   - Integrated into [`src/mcp-entry.ts`](../src/mcp-entry.ts) (`check_trust_score`) and [`src/lib/guardrails.ts`](../src/lib/guardrails.ts) (`resolveRecipientTrustScore`).

2. **SSRF Protection & Keyed AsyncMutex ([`src/lib/ssrf.ts`](../src/lib/ssrf.ts) & [`src/lib/cashu.ts`](../src/lib/cashu.ts))**:
   - `isSafeExternalUrl`: Strictly blocks non-HTTP protocols, loopback addresses (`127.0.0.0/8`, `::1`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and cloud metadata (`169.254.169.254`).
   - Integrated across Mint probing (`fetchMintInfo`), NIP-05 verification (`verifyNip05`), and mint validation (`isValidMintUrl`).
   - `KeyedAsyncMutex`: Serializes concurrent token split calls on identical proofs/mints, completely preventing `Token already spent` race conditions.

3. **Daemon Memory Leak Safeguards ([`scripts/dvm-worker.ts`](../scripts/dvm-worker.ts) & [`src/lib/mint-mesh.ts`](../src/lib/mint-mesh.ts))**:
   - `scripts/dvm-worker.ts`: FIFO-bounded eviction for `processedJobs` (capped at max 5,000 IDs).
   - `src/lib/mint-mesh.ts`: Eviction of expired entries and FIFO-bounding for `auditCache` (capped at max 200 items).

4. **MCP Server Profiles & Unified Test Runner ([`scripts/run-all-tests.ts`](../scripts/run-all-tests.ts))**:
   - 4 specialized MCP client profiles (`minimal`, `radar`, `payment`, `full`).
   - Unified deterministic test runner executing all 8 core test suites with markdown summary table.

### Verification Commands
```bash
# Verify Security Enhancements (SSRF, AsyncMutex, WoT Hop-2)
npx tsx scripts/test-security-enhancements.ts

# Verify MCP Server over Stdio JSON-RPC Transport
npx tsx scripts/test-mcp-stdio.ts

# Verify MCP Tool Profiles
npx tsx scripts/test-profiles.ts

# Run the complete test suite runner
npm test
```

---

## 🧪 Comprehensive Verification Checklist

| Test Suite | Purpose | Execution Command | Result |
| :--- | :--- | :--- | :---: |
| **TypeScript Validation** | Full strict type checking with 0 errors | `npm run typecheck` | **PASS (0 errors)** |
| **Unified Core Runner** | 8 core deterministic unit & integration suites | `npm test` | **PASS (100%)** |
| **Production Build** | Dual bundle generation (`mcp-entry` & `sdk`) | `npm run build:mcp` | **PASS** |
| **RFC 8949 CBOR & NIP-59** | Zero-Buffer codecs & timestamp jitter | `npx tsx scripts/test-cbor-and-giftwrap-nutzap.ts` | **PASS** |
| **Spending Guardrails** | Budget limits & SQLite audit trail | `npx tsx scripts/test-guardrails-policy.ts` | **PASS** |
| **Agent Identity** | Zero-config key bootstrapping & persistence | `npx tsx scripts/test-guardrails.ts` | **PASS** |
| **Mint Mesh** | NUT-06 probing & counterparty risk audit | `npx tsx scripts/test-mint-mesh.ts` | **PASS** |
| **NIP-47 NWC** | Lightning rail payment & timeout protection | `npx tsx scripts/test-nwc.ts` | **PASS** |
| **Security Enhancements** | SSRF protection & Keyed AsyncMutex | `npx tsx scripts/test-security-enhancements.ts` | **PASS** |
| **MCP Stdio Server** | Claude Desktop / Cursor agent tool interface | `npx tsx scripts/test-mcp-stdio.ts` | **PASS** |

---

## 📚 Documentation Reference Links
- [System Blueprint](./SYSTEM_BLUEPRINT.md)
- [Architecture Audit](./ARCHITECTURE_AUDIT.md)
- [Local Agent Web Search Plan](./AGENT_WEB_SEARCH_PLAN.md)
- [Standalone SDK Entry](../src/sdk/index.ts)
- [Model Context Protocol Server](../src/mcp-entry.ts)
