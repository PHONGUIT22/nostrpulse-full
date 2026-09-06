<div align="center">

# ⚡ NostrPulse
### Sovereign Identity Analytics, Anti-Sybil Reputation Engine & Dual-Rail Bitcoin eCash Protocol

[![License: MIT](https://img.shields.io/badge/License-MIT-9333EA?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Track](https://img.shields.io/badge/Track_2-Freedom_Stack-F7931A?style=for-the-badge&logo=bitcoin&logoColor=white)](https://bitshala.org)
[![Nostr Protocol](https://img.shields.io/badge/Nostr-NIPs_Compliant-8A2BE2?style=for-the-badge&logo=nostr)](https://github.com/nostr-protocol/nips)
[![Cashu Protocol](https://img.shields.io/badge/Cashu-NUTs_V4_eCash-00D084?style=for-the-badge)](https://cashu.space)
[![Next.js 16](https://img.shields.io/badge/Next.js_16-App_Router-000000?style=for-the-badge&logo=next.js)](https://nextjs.org/)

<br />

<p align="center">
  <b>NostrPulse</b> is an open-source analytics dashboard and sovereign trust layer built on top of the <b>Freedom Tech Stack</b> (Nostr + Bitcoin Lightning + Cashu Chaumian eCash). It transforms raw cryptographic keypairs into verifiable reputation metrics while enabling friction-free, offline Value-4-Value micro-settlements.
</p>

<p align="center">
  <a href="https://nostrpulse.vercel.app/"><b>Explore Live Explorer »</b></a> •
  <a href="https://nostrpulse.vercel.app/bounties"><b>Bounty Board</b></a> •
  <a href="https://nostrpulse.vercel.app/about"><b>Methodology</b></a> •
  <a href="https://nostrpulse.vercel.app/relays"><b>Relay Telemetry</b></a> •
  <a href="https://nostrpulse.vercel.app/compare"><b>Versus Engine</b></a>
</p>

</div>

---

## 🌐 The Problem & The Freedom Solution

Open protocols like Nostr eliminate centralized deplatforming, but introduce two structural vulnerabilities:
1. **Sybil Attacks & Impersonation:** Generating keypairs (`npub`) costs nothing, making bot farms and impersonation rampant.
2. **Payment Fragility:** Traditional Lightning Zaps (NIP-57) fail if the creator's node goes offline or encounters inbound routing channel bottlenecks.

### Paradigm Shift

| Vector | Legacy Web2 Garden | NostrPulse (Freedom Tech Stack) |
| :--- | :--- | :--- |
| **Identity Control** | Centralized database, arbitrary bans | **Cryptographic Sovereign Keypairs (`NIP-01 / NIP-19`)** |
| **Sybil Resistance** | Black-box KYC & phone tracking | **5-Pillar Deterministic Trust Engine & Web-of-Trust** |
| **Monetization** | 30% platform tax & payout freezes | **0% Intermediary Fee Native Bitcoin Micro-tips** |
| **Settlement Rails** | Synchronous banking rails only | **Dual-Rail: Lightning (NIP-57) + Cashu eCash (NIP-61)** |
| **Autonomous Economy** | Closed APIs, credit card locks | **NIP-90 DVMs: Open AI Agent Tasks & 1-Tap NutZaps** |

---

## 🏛️ Multi-Tier System Pipeline

<table>
  <tr>
    <td width="25%" align="center"><b>1. Identity & Discovery</b></td>
    <td width="25%" align="center"><b>2. Reputation & Anti-Sybil</b></td>
    <td width="25%" align="center"><b>3. Dual-Rail Value Rails</b></td>
    <td width="25%" align="center"><b>4. NIP-90 DVM & Bounties</b></td>
  </tr>
  <tr>
    <td>
      • <b>NIP-01:</b> P2P WebSocket relays<br>
      • <b>NIP-05:</b> Cryptographic DNS records<br>
      • <b>NIP-07:</b> Signer (Alby, nos2x)<br>
      • <b>NIP-65:</b> Relay gossip mesh
    </td>
    <td>
      • <b>5-Pillar Scoring</b> (0–100 pts)<br>
      • <b>Social Graph WoT</b> analysis<br>
      • <b>Anti-Sybil Damping Guard</b><br>
      • <b>Real-time Live Telemetry</b>
    </td>
    <td>
      • <b>NIP-57:</b> Lightning Zaps<br>
      • <b>NIP-61:</b> Cashu NutZaps<br>
      • <b>NIP-44:</b> E2E payload encryption<br>
      • <b>NUT-00 v4:</b> CBOR (<code>cashuB</code>)
    </td>
    <td>
      • <b>NIP-90:</b> DVM Worker Daemon<br>
      • <b>Kind 5000 / 6000 / 7000:</b> Jobs<br>
      • <b>WoT Bounty Filtering:</b> Spam-free<br>
      • <b>1-Tap NutZap:</b> Deliverable pay
    </td>
  </tr>
</table>

---

## 🚀 Key Innovations & Engineering Highlights

### 1. 🛡️ 5-Pillar Cryptographic Trust Score (Anti-Sybil Engine)

NostrPulse calculates an objective 0–100 point reputation index directly from open relay data:

| Pillar | Verification Signal | Max Points |
| :--- | :--- | :---: |
| **Pillar 1** | **NIP-05 Cryptographic DNS Binding:** Validates `.well-known/nostr.json` against the public key (Bonus for custom sovereign domains). | **25 pts** |
| **Pillar 2** | **Web-of-Trust (WoT) Graph Connectivity:** Evaluates proximity to verified protocol seed keys (`jack`, `fiatjaf`, `jb55`, `odell`, etc.). | **25 pts** |
| **Pillar 3** | **Lightning V4V Endpoint:** Verifies live LNURL-pay / `lud16` address and Lightning callback response. | **20 pts** |
| **Pillar 4** | **Keypair Longevity & Multi-Relay Depth:** Assesses age of keypair and replication count across global relays. | **15 pts** |
| **Pillar 5** | **Metadata Richness & Authenticity:** Verifies complete avatar, bio, and valid external domain presence. | **15 pts** |

> [!IMPORTANT]
> **Anti-Sybil Damping Guard:** If an account lacks verified NIP-05 DNS signatures **AND** has an isolated Web-of-Trust graph, its score is **strictly capped at 44 (Tier: Unverified / Potential Bot)**. This permanently neutralizes automated bots that populate fake metadata profiles.

---

### 2. ⚡ Dual-Rail Value-4-Value Settlement (Lightning + Cashu eCash)

A unified micro-transaction interface switching effortlessly between real-time and offline settlement rails:

[ 1-Click In-App Minting & NutZap Pipeline ]
User selects Sats ──► Request NUT-04 Quote ──► Settle via WebLN/QR ──► Poll Mint & Claim Proofs ──► Encrypt NIP-44 ──► Broadcast Kind 9321


* **100% Asynchronous NutZaps (NIP-61):** Tippers can send Chaumian eCash to creators even when the creator's Lightning node is completely offline.
* **Front-Running Defense (NIP-44 v2 Encryption):** Bearer tokens inside `Kind 9321` events are encrypted with the recipient's public key. Relay operators and scrapers cannot steal token proofs in transit.
* **Native NUT-00 V4 CBOR Decoding:** Includes a zero-dependency binary parser compliant with RFC 8949, reading both legacy `cashuA` (JSON Base64) and next-gen `cashuB` (CBOR) tokens.
* **Dynamic Mint Router:** Switch on the fly between **Minibits**, **Macadamia**, **Cashu Testnut**, or any self-hosted Mint endpoint.

---

### 3. 📡 Dynamic Relay Mesh & Live WebSocket Telemetry

* **NIP-65 Gossip Synchronization:** Ingests `Kind 10002` relay lists to query each creator's preferred relay mesh dynamically.
* **Live Latency Benchmark:** Direct client-side WebSocket ping benchmarking across 12+ global relay nodes.
* **Real-time Kind 9735 Stream:** Multi-threaded subscription to public relays streaming live Bitcoin Zaps with instant visual confirmation.

---

### 4. ⚔️ Creator Versus Engine & Embeddable Badges

* **Versus Arena:** Side-by-side metric comparison between any two Nostr profiles (`npub` vs `npub`) across Trust Scores, Lightning capability, and metadata.
* **Embeddable Trust Badges:** Dynamic SVG badges (`/api/badge/[npub]`) ready to embed in GitHub READMEs, blogs, and personal portfolios.

---

### 5. 🤖 NIP-90 Autonomous DVM Worker & Decentralized Bounty Marketplace

NostrPulse bridges autonomous AI agents, automated verification bots, and human work using the **NIP-90 Data Vending Machine** standard:

* **Autonomous Trust Score DVM Bot (`scripts/dvm-worker.ts`):** A persistent background worker that listens for `Kind 5000` job requests tagged with `["t", "trust-score"]`. It immediately acknowledges receipt via `Kind 7000` (status `processing`), queries Nostr relays for the target profile, computes the full 5-Pillar Trust Score, and broadcasts `Kind 6000` with the structured result and a 5-Sat demand (`["amount", "5000"]`).
* **NIP-90 Client Protocol SDK (`src/lib/nip90.ts`):** Complete client utility library offering `publishJobRequest()`, `fetchOpenBounties()`, and `subscribeJobFeedbackAndResult()` with native `normalizeToHex` input sanitization and browser NIP-07 signer support.
* **Anti-Sybil Bounty Marketplace (`/bounties`):** Open decentralized task board where users discover jobs, audit creator credibility, and publish new tasks with Alby / nos2x extension signatures.
* **Dynamic Web-of-Trust Reputation Filter:** Eliminates Sybil spam by allowing workers to filter bounties by creator Trust Score (*All*, *Anti-Spam Score ≥ 20*, *Active Contributors ≥ 50*, *Verified Builders ≥ 80*).
* **1-Tap Cashu NutZap Settlement (`TaskResultView.tsx`):** Review deliverables (formatted Trust Score analytics or raw JSON), verify Cashu eCash proofs via `verifyTokenWithMint()`, and settle bounties with 1 click using NIP-44 encrypted `Kind 9321` NutZaps directly to the worker's pubkey.

---

## 📜 Protocol Specifications (NIPs & NUTs)

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
      <td><b>NIP-01</b></td>
      <td>Basic protocol flow, event signing, and multi-relay subscription</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-05</b></td>
      <td>DNS-based internet identifier cryptographic mapping</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NIP-07</b></td>
      <td><code>window.nostr</code> browser extension signer (Alby, nos2x)</td>
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
      <td><b>NIP-57</b></td>
      <td>Lightning Zaps (<code>Kind 9734</code> Zap Request & <code>Kind 9735</code> Zap Receipt)</td>
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
      <td><b>NUT-00</b></td>
      <td>Cashu Cryptography & Token Formats: V3 (JSON) & V4 (CBOR Binary)</td>
      <td>✅ Active</td>
    </tr>
    <tr>
      <td><b>NUT-04</b></td>
      <td>Minting operations via Lightning BOLT-11 quotes</td>
      <td>✅ Active</td>
    </tr>
  </tbody>
</table>

---

## 🛠️ Technology Stack & Architecture

* **Core Framework:** Next.js 16 (App Router, Server Components & Streaming SSR)
* **Language:** TypeScript (Strict type-checking on all cryptographic structures)
* **Styling:** Tailwind CSS v4, Base UI, Lucide Icons
* **Protocol Libraries:** `nostr-tools` (v2.x), `@cashu/cashu-ts` (v4.x), `@noble/hashes`
* **Zero-Buffer Client Engine:** Fully decoupled from Node.js `Buffer` globals using native browser `Uint8Array` primitives for zero-crash cross-browser reliability.
* **Non-Blocking Resilience:** All network queries are wrapped with `AbortSignal.timeout()` and `Promise.race()` fallbacks to eliminate UI freezes.

---

## ⚡ Quickstart & Local Setup

### Prerequisites
* Node.js `>= 18.18.0`
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

### 3. Run the Autonomous NIP-90 DVM Worker
```bash
# Start background worker daemon calculating Trust Scores for Sats
npx tsx scripts/dvm-worker.ts

# Test DVM worker with an independent test client
npx tsx scripts/test-dvm-client.ts

# Test NIP-90 client module querySync and publishing
npx tsx scripts/test-nip90-module.ts
```

---

## 🗺️ Roadmap & Future Horizons

- [x] **Phase 1:** Deterministic 5-Pillar Trust Score Engine & Anti-Sybil Damping Guard.
- [x] **Phase 2:** NIP-57 Lightning Zap integration with WebLN & live receipt streaming.
- [x] **Phase 3:** NIP-61 NutZap dual-mode engine with NUT-00 V4 CBOR decoding & NIP-44 encryption.
- [x] **Phase 4:** NIP-65 dynamic relay synchronization & browser WebSocket telemetry.
- [x] **Phase 5:** NIP-90 Data Vending Machines: Autonomous Trust Score worker bot & decentralized `/bounties` marketplace.
- [x] **Phase 6:** 1-Tap Cashu NutZap settlement for deliverable acceptance & instant payout.
- [ ] **Phase 7:** NUT-11 (P2PK) locks for deterministic, recipient-locked eCash NutZaps.
- [ ] **Phase 8:** Standalone `@nostrpulse/sdk` for seamless integration into third-party Nostr clients.

---

## ⚖️ License & Non-Custodial Disclaimer
Distributed under the MIT License. NostrPulse is strictly non-custodial software: it never generates, stores, or requests user private keys (nsec), nor does it take custody of user funds.