// scripts/test-unified-agent-facade.ts
/**
 * Test Suite: Unified Agent Wallet Facade (NostrPulseAgent)
 *
 * Verifies the 3-line high-level developer experience wrapping:
 * 1. Identity & Database initialization + spending policy setup
 * 2. Stateful Cashu eCash deposit
 * 3. 5-Pillar Anti-Sybil Web-of-Trust peer verification
 * 4. Automated Vault withdrawal, proof split, and dryRun settlement
 * 5. Anti-Sybil Guardrail blocking (preserving vault funds)
 * 6. Single-transaction cap enforcement (preserving vault funds)
 */

import { NostrPulseAgent, createAgentWallet } from "../src/lib/agent-facade";
import { initDatabase, getDb, clearVaultProofs } from "../src/lib/db";
import { encodeCashuToken, type CashuProof } from "../src/lib/cashu";

async function main() {
  console.log("===============================================================================");
  console.log("  TEST: UNIFIED AGENT WALLET FACADE (NostrPulseAgent)                          ");
  console.log("===============================================================================\n");

  // Reset persistent test state for deterministic 200-sat daily budget checks
  await initDatabase();
  const db = getDb();
  await clearVaultProofs();
  await db.execute("DELETE FROM agent_spending_log");

  const fiatjafHex = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
  const sybilHex = "0000000000000000000000000000000000000000000000000000000000000001";
  const mockMint = "https://mock-mint.nostrpulse.org";

  // ---------------------------------------------------------------------------
  // TEST 1: Initialize NostrPulseAgent with configured policy limits
  // ---------------------------------------------------------------------------
  console.log(">>> [1/6] Initializing NostrPulseAgent wallet facade...");
  const wallet = new NostrPulseAgent({
    maxSingleTxSats: 50,
    maxDailySats: 200,
    minTrustScore: 50,
  });

  // Also test factory function export
  const factoryWallet = createAgentWallet({ maxDailySats: 500 });
  if (!(factoryWallet instanceof NostrPulseAgent)) {
    throw new Error("createAgentWallet() did not return a NostrPulseAgent instance");
  }

  const initialStatus = await wallet.getBalance();
  if (!initialStatus.agentPubkey || !initialStatus.agentNpub.startsWith("npub1")) {
    throw new Error("Agent identity failed to initialize");
  }
  if (initialStatus.totalBalanceSats !== 0) {
    throw new Error(`Expected 0 initial sats, got ${initialStatus.totalBalanceSats}`);
  }
  if (
    initialStatus.policy.maxSingleTxSats !== 50 ||
    initialStatus.policy.maxDailySats !== 200 ||
    initialStatus.policy.minTrustScore !== 50
  ) {
    throw new Error("Wallet policy mismatch with constructor configuration");
  }
  console.log(`  [+] Agent Pubkey: ${initialStatus.agentPubkey}`);
  console.log(`  [+] Policy: maxTx=${initialStatus.policy.maxSingleTxSats}s, daily=${initialStatus.policy.maxDailySats}s, minTrust=${initialStatus.policy.minTrustScore}\n`);

  // ---------------------------------------------------------------------------
  // TEST 2: Deposit 100 sats Cashu token into Vault
  // ---------------------------------------------------------------------------
  console.log(">>> [2/6] Depositing 100 sats via wallet.deposit()...");
  const mockProofs: CashuProof[] = [
    {
      id: "009a1f293252f338",
      amount: 100,
      secret: "sec_facade_test_100_sats",
      C: "02b90fc42f65f04ff7b2b8e30b8054b1f6920ad96781216dd5a6a6669fb8bc76ba",
    },
  ];
  const mockToken = encodeCashuToken(mockMint, mockProofs);
  const depositRes = await wallet.deposit(mockToken, { skipRemoteVerify: true });

  if (depositRes.depositedSats !== 100 || depositRes.newTotalBalance !== 100) {
    throw new Error(`Expected 100 sats deposit & balance, got ${JSON.stringify(depositRes)}`);
  }
  console.log(`  [+] Deposited: ${depositRes.depositedSats} sats (Balance: ${depositRes.newTotalBalance} sats)\n`);

  // ---------------------------------------------------------------------------
  // TEST 3: Verify Peers (Root Anchor vs Isolated Sybil Pubkey)
  // ---------------------------------------------------------------------------
  console.log(">>> [3/6] Testing Anti-Sybil Web-of-Trust peer verification...");
  const fiatjafPeer = await wallet.verifyPeer(fiatjafHex);
  if (!fiatjafPeer.isRootAnchor || !fiatjafPeer.allowedToPay || fiatjafPeer.trustScore < 50) {
    throw new Error(`Expected Root Anchor fiatjaf to be allowedToPay: true, got ${JSON.stringify(fiatjafPeer)}`);
  }
  console.log(`  [+] Root Anchor (fiatjaf): score=${fiatjafPeer.trustScore}, distance=${fiatjafPeer.wotDistance}, allowed=${fiatjafPeer.allowedToPay}`);

  const sybilPeer = await wallet.verifyPeer(sybilHex);
  if (sybilPeer.allowedToPay || sybilPeer.isRootAnchor) {
    throw new Error(`Expected unknown Sybil pubkey to be blocked (allowedToPay: false), got ${JSON.stringify(sybilPeer)}`);
  }
  console.log(`  [+] Unknown Sybil Peer: score=${sybilPeer.trustScore}, distance=${sybilPeer.wotDistance}, allowed=${sybilPeer.allowedToPay}\n`);

  // ---------------------------------------------------------------------------
  // TEST 4: Valid Autonomous Payment (21 sats to fiatjaf, dryRun: true)
  // ---------------------------------------------------------------------------
  console.log(">>> [4/6] Paying 21 sats to verified Root Anchor (dryRun: true)...");
  const receipt = await wallet.pay({
    to: fiatjafHex,
    amountSats: 21,
    memo: "Unified Facade Payment Test",
    dryRun: true,
  });

  if (!receipt.success || receipt.status !== "settled" || receipt.remainingBalanceSats !== 79) {
    throw new Error(`Expected settled receipt with 79 sats remaining, got ${JSON.stringify(receipt)}`);
  }
  const statusAfterPay = await wallet.getBalance();
  if (statusAfterPay.totalBalanceSats !== 79) {
    throw new Error(`Expected vault balance 79 sats after payment, got ${statusAfterPay.totalBalanceSats}`);
  }
  console.log(`  [+] Payment settled (txId: ${receipt.txId})`);
  console.log(`  [+] Vault balance automatically split & updated: ${statusAfterPay.totalBalanceSats} sats remaining.\n`);

  // ---------------------------------------------------------------------------
  // TEST 5: Anti-Sybil Block on Low-Trust Recipient
  // ---------------------------------------------------------------------------
  console.log(">>> [5/6] Attempting payment to low-trust Sybil pubkey...");
  const sybilReceipt = await wallet.pay({
    to: sybilHex,
    amountSats: 15,
    dryRun: true,
  });

  if (sybilReceipt.success || sybilReceipt.status !== "blocked_by_guardrails") {
    throw new Error(`Expected Sybil payment to be blocked_by_guardrails, got ${JSON.stringify(sybilReceipt)}`);
  }
  const balanceAfterSybil = await wallet.getBalance();
  if (balanceAfterSybil.totalBalanceSats !== 79) {
    throw new Error(`Expected vault balance untouched at 79 sats, got ${balanceAfterSybil.totalBalanceSats}`);
  }
  console.log(`  [+] Sybil payment blocked: "${sybilReceipt.reason}"`);
  console.log(`  [+] Vault balance preserved at ${balanceAfterSybil.totalBalanceSats} sats.\n`);

  // ---------------------------------------------------------------------------
  // TEST 6: Single Transaction Limit Enforcement (60 sats > 50 sats max)
  // ---------------------------------------------------------------------------
  console.log(">>> [6/6] Attempting 60 sats payment exceeding maxSingleTxSats (50)...");
  const overCapReceipt = await wallet.pay({
    to: fiatjafHex,
    amountSats: 60,
    dryRun: true,
  });

  if (overCapReceipt.success || overCapReceipt.status !== "blocked_by_guardrails") {
    throw new Error(`Expected 60 sats payment to be blocked_by_guardrails, got ${JSON.stringify(overCapReceipt)}`);
  }
  const balanceAfterOverCap = await wallet.getBalance();
  if (balanceAfterOverCap.totalBalanceSats !== 79) {
    throw new Error(`Expected vault balance untouched at 79 sats, got ${balanceAfterOverCap.totalBalanceSats}`);
  }
  console.log(`  [+] Over-cap payment blocked: "${overCapReceipt.reason}"`);
  console.log(`  [+] Vault balance preserved at ${balanceAfterOverCap.totalBalanceSats} sats.\n`);

  // Clean up test state
  await clearVaultProofs();
  await db.execute("DELETE FROM agent_spending_log");

  console.log("===============================================================================");
  console.log("  ALL UNIFIED AGENT WALLET FACADE TESTS PASSED (100% GREEN)                    ");
  console.log("===============================================================================");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
