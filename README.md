<div align="center">

# ⚡ NostrPulse
### The Decentralized Stripe & Radar for Autonomous AI Agents
**Autonomous Payment & Sybil-Resistant Trust Layer for AI Agents via Nostr, Cashu eCash (NIP-61), and MCP.**

[![npm version](https://img.shields.io/npm/v/nostrpulse-mcp?style=for-the-badge&color=CB3837&logo=npm)](https://www.npmjs.com/package/nostrpulse-mcp)
[![Release: v1.1.1](https://img.shields.io/badge/Release-v1.1.1-2563EB?style=for-the-badge&logo=github)](https://github.com/PHONGUIT22/nostrpulse-full/releases)
[![MCP Stdio](https://img.shields.io/badge/MCP-Stdio_Protocol-009688?style=for-the-badge)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-9333EA?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Track](https://img.shields.io/badge/Track_2-Freedom_Stack-F7931A?style=for-the-badge&logo=bitcoin&logoColor=white)](https://bitshala.org)
[![Nostr Protocol](https://img.shields.io/badge/Nostr-NIP--47_NWC_Lightning-8A2BE2?style=for-the-badge&logo=nostr)](https://github.com/nostr-protocol/nips/blob/master/47.md)
[![Cashu Protocol](https://img.shields.io/badge/Cashu-NUT--06_Mint_Radar-00D084?style=for-the-badge)](https://cashu.space)
[![Next.js 16](https://img.shields.io/badge/Next.js_16-App_Router-000000?style=for-the-badge&logo=next.js)](https://nextjs.org/)

<br />

<p align="center">
  <b>NostrPulse</b> is an open-source payment and sovereign trust layer for autonomous AI agents, built on top of the <b>Freedom Tech Stack</b> (Nostr + Bitcoin Lightning + Cashu Chaumian eCash + Model Context Protocol). It provides <b>Stripe-like settlement</b> (M2M micro-payments via NIP-61 NutZaps) and <b>Stripe Radar-grade anti-Sybil protection</b> (Web-of-Trust graph distance + verifiable Economic Stake) for Cursor, Claude Desktop, and autonomous LLMs.
</p>

<p align="center">
  <a href="https://nostrpulse.vercel.app/"><b>Explore Live Explorer »</b></a> •
  <a href="https://nostrpulse.vercel.app/agent"><b>AI Agent Interface</b></a> •
  <a href="https://nostrpulse.vercel.app/bounties"><b>Bounty Board</b></a> •
  <a href="https://nostrpulse.vercel.app/about"><b>Methodology</b></a> •
  <a href="https://nostrpulse.vercel.app/relays"><b>Relay Telemetry</b></a> •
  <a href="https://nostrpulse.vercel.app/compare"><b>Versus Engine</b></a>
</p>

</div>

---

## 🤖 MCP Server for AI Agents (Stripe for AI)

NostrPulse natively exports an industry-standard **Model Context Protocol (MCP)** server over Stdio JSON-RPC. Any AI client (Claude Desktop, Cursor, Windsurf, LangChain, Vercel AI SDK) can instantly tap into decentralized reputation, machine-to-machine micropayments, and distributed compute without API keys or custodial accounts.

### 1. Zero-Code Quickstart (Cursor & Claude Desktop)

Paste this configuration directly into your `claude_desktop_config.json` or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "nostrpulse": {
      "command": "npx",
      "args": ["-y", "nostrpulse-mcp"]
    }
  }
}
```

* **Claude Desktop Config File Locations:**
  * **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
  * **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
* **Cursor IDE:** Save to `.cursor/mcp.json` in your project root, or add under *Cursor Settings > Features > MCP*.

### 2. Interactive Testing via MCP Inspector

Verify tools, examine schemas, and test prompts in the browser via the official Model Context Protocol Inspector:

```bash
npx @modelcontextprotocol/inspector npx -y nostrpulse-mcp
```

### 3. Core MCP Tools Lookup Table

| Tool Name | Type | Description |
| :--- | :---: | :--- |
| `check_trust_score` | **Radar / Anti-Sybil** | Anti-fraud radar for AI agents. Evaluates Web-of-Trust Ring-1 (22 Root Anchors), transitive hops, and Sybil-filtered Economic Stake (sats) before interacting or paying. |
| `pay_cashu_nutzap` | **Payment Rails (eCash)** | Instant machine-to-machine (M2M) settlement with Chaumian eCash (NIP-61 NutZap) wrapped in metadata-private NIP-59 Gift Wrap and NIP-44 encryption. Wrapped with pre-flight spending guardrails. |
| `request_nip90_job` | **Decentralized Compute** | Dispatches compute and data-processing tasks to decentralized NIP-90 Data Vending Machines (DVMs) across Nostr relays with local SQLite cache fallback. |
| `pay_lightning_nwc` | **Payment Rails (Lightning)** | Settle BOLT-11 Lightning invoices directly through an autonomous node via NIP-47 Nostr Wallet Connect (Alby Hub, Phoenixd, Umbrel) with spending guardrails. |
| `pay_with_nwc` | **Payment Rails (Alias)** | Direct NWC payment executor alias for `pay_lightning_nwc`. |
| `audit_cashu_mint` | **Mint Radar** | Audit and evaluate counterparty risk of a Cashu eCash Mint using Web-of-Trust graph distance, NIP-05 sovereign domain validation, and admin reputation. |
| `route_cashu_mint` | **Mint Mesh** | Dynamically discover and route to the highest-trust, lowest-latency Cashu Mint from the WoT-Gated Dynamic Mint Mesh. |
| `get_agent_identity` | **Zero-Config Identity** | Retrieve active autonomous AI agent cryptographic public identity (`pubkey`, `npub`, keystore source, ephemeral status). Automatically bootstraps local keys. |
| `get_spending_guardrails` | **Budget Gatekeeper** | Query current AI agent spending guardrails, daily budget (500 sats rolling), 24h satoshis spent, remaining allowance, and per-tx limits (50 sats). |
| `get_agent_telemetry` | **Telemetry & Audit** | Inspect autonomous agent spending metrics, rolling 24h budget allowance, blocked Sybil threats, and Stripe Radar-grade recent telemetry events. |

---

## 🌐 The Problem & The Freedom Solution

Open agentic systems and decentralized protocols eliminate platform lock-in, but introduce two critical vulnerabilities:
1. **Agent Impersonation & Sybil Floods:** Cryptographic keypairs (`npub`) cost $0 to generate, making spam bots, clone accounts, and wash-trading rampant.
2. **Payment Fragility & KYC Lockouts:** Legacy banking rails (Stripe/PayPal) freeze autonomous agents. Synchronous Lightning Zaps (NIP-57) fail when receiver nodes are offline or lack inbound liquidity channels.

### Paradigm Shift

| Vector | Legacy Web2 / Stripe | NostrPulse (Freedom Tech Stack) |
| :--- | :--- | :--- |
| **Agent Identity** | API keys, credit cards, KYC bans | **Cryptographic Sovereign Keypairs (`NIP-01 / NIP-19`)** |
| **Anti-Fraud (Radar)** | Centralized black-box heuristic rules | **Web-of-Trust Ring-1 (22 Anchors) + Anti-Sybil Sats Stake** |
| **M2M Settlement** | 30% platform cuts, merchant holds | **Chaumian eCash (NIP-61 NutZaps): Zero-fee, instant, private** |
| **Offline Delivery** | Synchronous connection required | **Asynchronous NutZaps via NIP-59 Gift Wrap & Relays** |
| **Compute Delegation** | Proprietary cloud APIs | **NIP-90 Data Vending Machines (Open Compute Marketplace)** |
| **AI Protocol** | Custom vendor REST wrappers | **Stdio JSON-RPC via Model Context Protocol (`nostrpulse-mcp`)** |

---

## 🏛️ Multi-Tier System Pipeline

<table>
  <tr>
    <td width="25%" align="center"><b>1. Identity & Discovery</b></td>
    <td width="25%" align="center"><b>2. Reputation & Anti-Sybil</b></td>
    <td width="25%" align="center"><b>3. Multi-Rail Value Rails</b></td>
    <td width="25%" align="center"><b>4. AI MCP & NIP-90 DVM</b></td>
  </tr>
  <tr>
    <td>
      • <b>NIP-01:</b> P2P WebSocket relays<br>
      • <b>NIP-05:</b> Cryptographic DNS<br>
      • <b>NIP-07:</b> Signer (Alby, nos2x)<br>
      • <b>NIP-65:</b> Relay gossip mesh
    </td>
    <td>
      • <b>5-Pillar Score</b> (0–100 pts)<br>
      • <b>22 Root Anchors</b> WoT graph<br>
      • <b>Anti-Sybil Damping Guard</b><br>
      • <b>Mint Reputation Radar</b><br>
      • <b>Dual-bar Economic Stake</b>
    </td>
    <td>
      • <b>NIP-47:</b> NWC Lightning Rail<br>
      • <b>NIP-61:</b> Cashu NutZaps<br>
      • <b>NIP-57:</b> Lightning Zaps<br>
      • <b>NIP-59:</b> Gift Wrap Privacy<br>
      • <b>NUT-06:</b> Dynamic Mint Mesh
    </td>
    <td>
      • <b>MCP Stdio:</b> JSON-RPC server<br>
      • <b>npm:</b> <code>nostrpulse-mcp</code><br>
      • <b>NIP-90:</b> DVM Worker Daemon<br>
      • <b>Bounties:</b> WoT-gated tasks
    </td>
  </tr>
</table>

---

## 🚀 Key Innovations & Engineering Highlights

### 1. 🛡️ 5-Pillar Cryptographic Trust Score & Anti-Sybil Visualizer

NostrPulse calculates an objective 0–100 point reputation index directly from open relay data and root anchor graph topology:

| Pillar | Verification Signal | Max Points |
| :--- | :--- | :---: |
| **Pillar 1** | **NIP-05 Cryptographic DNS Binding:** Validates `.well-known/nostr.json` against the public key (Bonus for sovereign domains). | **25 pts** |
| **Pillar 2** | **Web-of-Trust (WoT) Ring-1 Proximity:** Evaluates graph distance to 22 verified protocol seed keys (`jack`, `fiatjaf`, `jb55`, `calle`, `odell`, etc.) with local SQLite fallback. | **25 pts** |
| **Pillar 3** | **Sats-Weighted In-Degree (Economic Stake):** Analyzes verified Zap receipts and filters out self-zaps and bot clones. Visualized with a dual progress bar. | **20 pts** |
| **Pillar 4** | **Keypair Longevity & Multi-Relay Depth:** Assesses keypair maturity and replication count across global relays. | **15 pts** |
| **Pillar 5** | **Metadata Richness & Authenticity:** Verifies avatar, bio, and external identity endpoints. | **15 pts** |

> [!IMPORTANT]
> **Anti-Sybil Damping Guard:** Accounts lacking verified NIP-05 DNS signatures **AND** isolated from the Web-of-Trust graph are **strictly capped at 44 points (Unverified / Potential Bot)**. This permanently neutralizes automated bot swarms.

---

### 2. ⚡ Dual-Rail Value-4-Value Settlement (Lightning + Cashu eCash)

A unified micro-transaction interface switching effortlessly between real-time Lightning and offline Chaumian eCash:

```text
[ 1-Click In-App Minting & NutZap Pipeline ]
User/Agent selects Sats ──► Request NUT-04 Quote ──► Settle via WebLN/QR ──► Poll Mint & Claim Proofs ──► Encrypt NIP-59/44 ──► Broadcast Kind 9321
```

* **100% Asynchronous NutZaps (NIP-61):** Senders deliver bearer eCash tokens to creators even when the recipient's Lightning node is offline.
* **NIP-59 Gift Wrap Envelope Privacy:** Wraps NutZaps with random ephemeral keypairs to conceal sender, recipient, and payload metadata from public relay scrapers.
* **Front-Running Defense (NIP-44 v2 Encryption):** Bearer tokens inside `Kind 9321` events are encrypted with the recipient's public key.
* **Native NUT-00 V4 CBOR Decoding:** Zero-dependency binary parser compliant with RFC 8949, reading both legacy `cashuA` (JSON Base64) and next-gen `cashuB` (CBOR) tokens.
* **Dynamic Mint Router:** Switch between **Minibits**, **Macadamia**, **Cashu Testnut**, or private self-hosted Mint endpoints.

---

### 3. ⚡ NIP-47 Nostr Wallet Connect (NWC) Direct Lightning Rail

NostrPulse integrates a high-performance, zero-memory-leak client for **NIP-47 Nostr Wallet Connect**, allowing AI agents to pay BOLT-11 Lightning invoices directly through self-hosted autonomous nodes (Alby Hub, Phoenixd, Umbrel, LNBits):

```text
[ NIP-47 Direct Lightning Settlement Pipeline ]
Agent receives Invoice ──► Parse NWC URI ──► Encrypt Payload (NIP-04/44) ──► Publish Kind 23194 ──► Listen Kind 23195 (Tagged by #e) ──► Extract Preimage & Fees ──► Destroy Pool & Subscriptions
```

* **Standardized Connection URIs:** Seamless parsing and generation of `nostr+walletconnect://<wallet_pubkey>?relay=<relay_url>&secret=<client_secret>&lud16=<lightning_address>&encryption=<nip04|nip44>`.
* **Zero-Leak Subscription Lifecycle:** Immediate resource cleanup upon resolution or timeout, destroying relay pools and event subscriptions to prevent memory retention in long-running agent daemons.
* **Dual Encryption Handshake:** Transparent fallback support for both legacy NIP-04 shared secrets and next-gen ChaCha20-Poly1305 NIP-44 v2 encryption.
* **Autonomous MCP Execution:** Exposed as `pay_lightning_nwc` (with alias `pay_with_nwc`) for 1-step settling by autonomous agents.

---

### 4. 🛡️ WoT-Gated Dynamic Mint Mesh & Counterparty Risk Radar (NUT-06)

Cashu Mints carry counterparty risk. NostrPulse acts as an objective, real-time **Radar for Mints** via `auditCashuMint` and `selectBestMint`:

```text
[ 5-Pillar Mint Risk Auditing & Dynamic Mesh Routing ]
Target Mint URL ──► Probe NUT-06 /v1/info ──► Extract Admin Contact ──► Resolve WoT & NIP-05 ──► Compute 5-Pillar Mint Score ──► Classify Risk (LOW / MODERATE / HIGH_RISK) ──► Route to Optimal Mint
```

* **NUT-06 Probe & Capability Auditing:** Evaluates mint uptime, operational response latency, and supported protocol capabilities (`NUT-04` Mint, `NUT-05` Melt, `NUT-07` StateCheck, `NUT-08` FeeReturn, `NUT-10` DLEQ Proofs, `NUT-11` P2PK).
* **Cryptographic Admin Identity Discovery:** Extracts Nostr operator pubkeys, NIP-05 sovereign domain signatures, or Nostr URIs from contact metadata, resolving transitive WoT graph distance to the 22 Root Anchors.
* **Tri-Tier Counterparty Risk Profiling (`MintRiskProfile`):**
  * `LOW` (Trust Score ≥ 75): **`TRUSTED`** (Directly verified operator, low latency, full NUT compliance).
  * `MODERATE` (Trust Score 45–74): **`USE_WITH_CAP`** (Community mint with acceptable uptime and WoT connectivity).
  * `HIGH_RISK` (Trust Score < 45 or unverified admin): **`AVOID`** (Anonymous, insecure HTTP, high latency, or isolated keypair).
* **Autonomous Mesh Selection (`selectBestMint`):** Evaluates candidate mint lists concurrently and dynamically selects the highest-trust, lowest-latency mint for proof creation and payment routing.

---

### 5. 🤖 Autonomous Machine Money Agent (`/agent`)

A dedicated interface demonstrating autonomous agent commerce:
* **Interactive AI Spender:** Agent equipped with Chaumian eCash wallet capable of paying creators automatically based on quality prompts.
* **Connect MCP Modal:** 1-click copy configuration for Claude Desktop and Cursor IDE.
* **Stand-alone NutZap Web Component (`public/widget.js`):** Lightweight `<nutzap-me npub="...">` button ready to embed on any blog, documentation, or static site.

---

### 6. 🤖 NIP-90 Autonomous DVM Worker & Decentralized Bounty Marketplace

* **Autonomous Trust Score DVM Bot (`scripts/dvm-worker.ts`):** Background worker that listens for `Kind 5000` job requests tagged with `["t", "trust-score"]`, computes scores, and broadcasts `Kind 6000` with 5-Sat demand (`["amount", "5000"]`).
* **NIP-90 Client SDK (`src/lib/nip90.ts`):** Utility library offering `publishJobRequest()`, `fetchOpenBounties()`, and `subscribeJobFeedbackAndResult()`.
* **Anti-Sybil Bounty Marketplace (`/bounties`):** Open decentralized task board filtered by creator Trust Score (*All*, *Score ≥ 20*, *Score ≥ 50*, *Score ≥ 80*).
* **1-Tap Cashu NutZap Settlement (`TaskResultView.tsx`):** Audit deliverables and settle bounties instantly with NIP-44/59 encrypted NutZaps.

---

### 7. 🛡️ Autonomous Agent Spending Guardrails & Budget Manager

To prevent autonomous agents from draining balances through infinite loops, hallucinated calls, or prompt injections, NostrPulse enforces real-time **Spending Guardrails**:

```text
[ Agent Payment Request ] ──► Check maxSatsPerTx (50 sats) ──► Check Rolling 24h Spend (500 sats) ──► Resolve WoT Score (>= 40)
                                            │                                      │                                 │
                                            ▼ (Any Violation)                      ▼ (Any Violation)                 ▼ (Any Violation)
                                  [ Short-Circuit Block ] ◄────────────── [ Short-Circuit Block ] ◄───────── [ Short-Circuit Block ]
                                            │
                                            ▼
                           Return { status: "blocked_by_guardrails" } (0 Sats Spent)
```

* **Per-Transaction Cap (`AGENT_MAX_SATS_PER_TX`):** Restricts single transaction calls to a safe default of **50 sats**.
* **24-Hour Rolling Budget (`AGENT_DAILY_LIMIT_SATS`):** Queries SQLite table `agent_spending_log` to enforce a rolling daily limit of **500 sats**.
* **Anti-Sybil Counterparty Gate (`AGENT_MIN_RECIPIENT_SCORE`):** Evaluates counterparty trust score via Web-of-Trust graph distance; payments to unverified or bot identities (< 40 score) are automatically intercepted and blocked.
* **Non-Custodial Safety:** Rejections return `{ status: "blocked_by_guardrails", reason }` instantly without spending funds.

---

### 8. 🔑 Zero-Config Sovereign Identity Bootstrapping

Eliminates the friction of requiring developers or agents to manually generate, paste, or expose `nsec` private keys before running:

```text
[ Agent Initialization ]
          │
          ├──► 1. Check process.env.NOSTR_SECRET_KEY / AGENT_NSEC (Hex or Bech32 nsec1...)
          │         └── Found? ──► Use environment identity
          │
          ├──► 2. Check Local Keystore (.nostrpulse/agent-identity.json)
          │         └── Exists? ──► Restore persistent identity
          │
          └──► 3. Cryptographic CSPRNG Generation (nostr-tools/pure)
                    └── Generates secp256k1 keypair ──► Writes to .nostrpulse/ (Mode 0600)
```

* **Automated Persistence:** Keypair is saved to `.nostrpulse/agent-identity.json` with restricted permissions and automatically excluded from Git commits via `.gitignore`.
* **Instant Readiness:** Tools like `get_agent_identity` allow agents to query their public identity (`pubkey`, `npub`, source, ephemeral flag) out-of-the-box.

---

### 9. 📊 Developer Telemetry & Stripe Radar Audit Trail

A comprehensive developer observability layer (`src/lib/telemetry.ts`) providing a Stripe-grade audit trail:
* **Event Logging:** Records structured JSON logs for `payment`, `radar_block`, `job_settlement`, and `mint_audit` into SQLite table `agent_telemetry`.
* **Developer Summary Metrics:** Computes `totalSpentSats`, `txCount`, and `blockedSybilAttacks` across configurable timeframes (default: 24h).
* **Dual Access:** Consumable directly by AI agents via MCP tool `get_agent_telemetry` and by web dashboards via Next.js REST API `GET /api/telemetry`.

---

## 📜 Protocol Specifications (NIPs, NUTs & MCP)

<table>
  <thead>
    <tr>
      <th>Specification</th>
      <th>Standard Description</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><b>MCP Stdio</b></td>
      <td>Anthropic Model Context Protocol via Stdio JSON-RPC (<code>nostrpulse-mcp</code>)</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-01</b></td>
      <td>Basic protocol flow, event signing, and multi-relay WebSocket subscriptions</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-05</b></td>
      <td>DNS-based internet identifier cryptographic mapping (<code>_@domain.com</code>)</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-07</b></td>
      <td>Browser extension signer interface (<code>window.nostr</code>: Alby, nos2x)</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-19</b></td>
      <td>Bech32 entity encoding (<code>npub1</code>, <code>nsec1</code>, <code>note1</code>, <code>nprofile1</code>)</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-44</b></td>
      <td>Versioned end-to-end payload encryption for secure token transport</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-47</b></td>
      <td>Nostr Wallet Connect: Direct Lightning payment execution via <code>Kind 23194</code> request & <code>Kind 23195</code> response</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-57</b></td>
      <td>Lightning Zaps (<code>Kind 9734</code> Zap Request & <code>Kind 9735</code> Zap Receipt)</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-59</b></td>
      <td>Gift Wrap Encryption (Ephemeral key envelope for metadata-leak-free token delivery)</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-61</b></td>
      <td>Cashu eCash NutZaps (<code>Kind 9321</code> encrypted Chaumian token delivery)</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-65</b></td>
      <td>Relay List Metadata (<code>Kind 10002</code>) for dynamic outbox routing</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-90</b></td>
      <td>Data Vending Machines (<code>Kind 5000</code> Request, <code>Kind 6000</code> Result, <code>Kind 7000</code> Feedback)</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>WoT Ring-1</b></td>
      <td>22 Root Anchors graph topology + local SQLite fallback cache</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NUT-00</b></td>
      <td>Cashu Cryptography & Token Formats: V3 (JSON Base64) & V4 (CBOR Binary)</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NUT-04</b></td>
      <td>Minting operations via Lightning BOLT-11 quotes and payment polling</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NUT-05</b></td>
      <td>Melting operations: Settle BOLT-11 Lightning invoices via Chaumian eCash proofs</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NUT-06</b></td>
      <td>Mint Information & Health endpoint: Supported NUTs, contact pubkeys, and latency probing</td>
      <td>✅ Active</td>
    </tr>
  </tbody>
</table>

---

## 🛠️ Technology Stack & Architecture

* **Framework:** Next.js 16 (App Router, Server Components & Streaming SSR)
* **Agent Protocols:** `@modelcontextprotocol/sdk` (v1.30+), OpenAI / Google Gemini AI SDK
* **Language:** TypeScript 5 (Strict type-checking on all cryptographic structures)
* **Styling:** Tailwind CSS v4, Base UI, Lucide Icons
* **Protocol Libraries:** `nostr-tools` (v2.25+), `@cashu/cashu-ts` (v4.9+), `@noble/hashes`
* **Zero-Buffer Client Engine:** Fully decoupled from Node.js `Buffer` globals using native browser `Uint8Array` primitives for universal cross-environment compatibility.
* **Non-Blocking Resilience:** All network queries are wrapped with `AbortSignal.timeout()` and `Promise.race()` fallbacks to eliminate UI freezes.

---

## ⚡ Quickstart & Local Setup

### Prerequisites
* Node.js `>= 20.0.0`
* `npm`, `pnpm`, or `yarn`

### 1. Clone & Install
```bash
git clone https://github.com/PHONGUIT22/nostrpulse-full.git
cd nostrpulse-full
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to explore the live dashboard.

### 3. Build & Run the MCP Server
```bash
# Build the production standalone MCP server bundle
npm run build:mcp

# Launch MCP server locally over stdio JSON-RPC
npx tsx src/mcp-entry.ts

# Or run the published npm package directly
npx -y nostrpulse-mcp
```

### 4. Run Verification & Test Suites
```bash
# Test Agent Spending Guardrails, Budget Limits & Zero-Config Identity
npx tsx scripts/test-guardrails.ts

# Test Developer Telemetry & Audit Trail data layer
npx tsx scripts/test-agent-telemetry.ts

# Test full MCP Stdio JSON-RPC integration (all 10 tools discovered & tested)
npx tsx scripts/test-mcp-stdio.ts

# Test NIP-47 NWC payment execution, URI parsing, and timeout guards
npx tsx scripts/test-nwc-pay.ts

# Test WoT-Gated Cashu Mint Mesh (Testnut & Minibits /v1/info audit & trust verification)
npx tsx scripts/test-mint-mesh.ts

# Test autonomous Mini-Agent calling NostrPulse MCP via Gemini / AI SDK
npx tsx scripts/test-mini-agent.ts

# Test self-contained NIP-59 Gift Wrap encryption & decryption
npx tsx scripts/test-nip59-encryption.ts

# Strict TypeScript type check (zero errors)
npx tsc --noEmit
```

---

## 🗺️ Roadmap & Milestones

- [x] **Phase 1:** Deterministic 5-Pillar Trust Score Engine & Anti-Sybil Damping Guard.
- [x] **Phase 2:** NIP-57 Lightning Zap integration with WebLN & live receipt streaming.
- [x] **Phase 3:** NIP-61 NutZap dual-mode engine with NUT-00 V4 CBOR decoding & NIP-44 encryption.
- [x] **Phase 4:** NIP-65 dynamic relay synchronization & browser WebSocket telemetry.
- [x] **Phase 5:** NIP-90 Data Vending Machines: Autonomous Trust Score worker bot & decentralized `/bounties` marketplace.
- [x] **Phase 6:** 1-Tap Cashu NutZap settlement for deliverable acceptance & instant payout.
- [x] **Phase 7:** MCP Stdio Server & npm package deployment (`nostrpulse-mcp` on npm registry).
- [x] **Phase 8:** NIP-47 Nostr Wallet Connect (NWC) direct Lightning rail for autonomous node settlement.
- [x] **Phase 9:** WoT-Gated Dynamic Mint Mesh & NUT-06 5-Pillar Counterparty Risk Radar.
- [x] **Phase 10:** Agent Spending Guardrails (single-tx cap & 24h limits), Zero-Config Identity Bootstrapping & Developer Telemetry Data Layer.
- [ ] **Phase 11:** Standalone `@nostrpulse/sdk` for seamless integration into third-party Nostr clients.

---

## ⚖️ License & Non-Custodial Disclaimer
Distributed under the MIT License. NostrPulse is strictly non-custodial software: it never generates, stores, or requests user private keys (`nsec`), nor does it take custody of user funds.