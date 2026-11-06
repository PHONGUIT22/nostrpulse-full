// scripts/test-stateful-agent-wallet.ts
/**
 * Test Suite: Stateful Cashu Agent Vault (Month 2 HRF Specification)
 *
 * Verifies:
 * 1. Initial vault balance checks.
 * 2. Ingesting & persisting eCash tokens into SQLite (nostrpulse.db).
 * 3. Accurate multi-mint balance tracking and aggregation.
 * 4. Micro-settlement splits (e.g. 100 sats deposit -> withdraw 21 sats -> 79 sats remaining change).
 * 5. Strict overdraw prevention and error handling.
 * 6. Multi-mint routing and preferred-mint withdrawals.
 */

import {
  depositCashuToken,
  getAgentWalletBalance,
  withdrawOrSplitProofsForPayment,
} from "../src/lib/wallet-vault";
import {
  clearVaultProofs,
  getUnspentVaultProofs,
} from "../src/lib/db";
import { encodeCashuToken, type CashuProof } from "../src/lib/cashu";

async function main() {
  console.log("===============================================================================");
  console.log("  TEST: STATEFUL CASHU AGENT VAULT & MULTI-MINT ECASH ENGINE                   ");
  console.log("===============================================================================\n");

  const mockMint1 = "https://mock-mint.nostrpulse.org";
  const mockMint2 = "https://secondary-mint.cashu.mesh";

  // ---------------------------------------------------------------------------
  // TEST 1: Initial Vault State Verification
  // ---------------------------------------------------------------------------
  console.log(">>> [1/6] Verifying initial vault balance...");
  await clearVaultProofs();

  const initialBalance = await getAgentWalletBalance();
  if (initialBalance.totalBalanceSats !== 0) {
    throw new Error(`Expected initial balance of 0 sats, got ${initialBalance.totalBalanceSats}`);
  }
  if (initialBalance.mints.length !== 0) {
    throw new Error(`Expected 0 mints registered, found ${initialBalance.mints.length}`);
  }
  console.log("  [+] Initial vault verified: 0 sats across 0 mints.\n");

  // ---------------------------------------------------------------------------
  // TEST 2: Ingesting & Depositing a Cashu Token (100 sats)
  // ---------------------------------------------------------------------------
  console.log(">>> [2/6] Depositing 100 sats Cashu token into Vault...");
  const initialProofs: CashuProof[] = [
    {
      id: "009a1f293252f338",
      amount: 100,
      secret: "sec_vault_proof_initial_100_sats",
      C: "02b90fc42f65f04ff7b2b8e30b8054b1f6920ad96781216dd5a6a6669fb8bc76ba",
    },
  ];
  const token100 = encodeCashuToken(mockMint1, initialProofs);

  const depositRes = await depositCashuToken(token100, { skipMintVerification: true });
  if (depositRes.depositedSats !== 100) {
    throw new Error(`Expected 100 deposited sats, got ${depositRes.depositedSats}`);
  }
  if (depositRes.newTotalBalance !== 100) {
    throw new Error(`Expected newTotalBalance 100 sats, got ${depositRes.newTotalBalance}`);
  }
  console.log(`  [+] Token deposited: ${depositRes.depositedSats} sats from ${depositRes.mintUrl}`);
  console.log(`  [+] New vault total balance: ${depositRes.newTotalBalance} sats.\n`);

  // ---------------------------------------------------------------------------
  // TEST 3: Verifying Aggregated Multi-Mint Balance
  // ---------------------------------------------------------------------------
  console.log(">>> [3/6] Verifying aggregated balance summary...");
  const balanceSummary = await getAgentWalletBalance();
  if (balanceSummary.totalBalanceSats !== 100) {
    throw new Error(`Summary balance mismatch: expected 100 sats, got ${balanceSummary.totalBalanceSats}`);
  }
  if (balanceSummary.mints.length !== 1) {
    throw new Error(`Expected 1 active mint, got ${balanceSummary.mints.length}`);
  }
  if (balanceSummary.mints[0].balanceSats !== 100) {
    throw new Error(`Mint balance mismatch: expected 100 sats, got ${balanceSummary.mints[0].balanceSats}`);
  }
  console.log(`  [+] Mint 1 (${balanceSummary.mints[0].mintUrl}): ${balanceSummary.mints[0].balanceSats} sats (${balanceSummary.mints[0].count} proofs).`);
  console.log("  [+] Aggregate balance verification passed.\n");

  // ---------------------------------------------------------------------------
  // TEST 4: Partial Payment (Withdraw / Split 21 sats from 100 sats)
  // ---------------------------------------------------------------------------
  console.log(">>> [4/6] Executing partial withdrawal: 21 sats NutZap payment...");
  const withdrawal = await withdrawOrSplitProofsForPayment(21, mockMint1);

  if (withdrawal.mintUrl !== mockMint1) {
    throw new Error(`Mint mismatch: expected ${mockMint1}, got ${withdrawal.mintUrl}`);
  }

  const sendTotal = withdrawal.sendProofs.reduce((sum, p) => sum + p.amount, 0);
  if (sendTotal !== 21) {
    throw new Error(`Withdrawal amount mismatch: expected 21 sats, got ${sendTotal}`);
  }
  console.log(`  [+] Outgoing sendProofs generated: ${sendTotal} sats across ${withdrawal.sendProofs.length} proofs.`);
  for (const p of withdrawal.sendProofs) {
    console.log(`      - proof: ${p.amount} sats (id: ${p.id.slice(0, 8)}...)`);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Verify Vault Remaining Change (Exactly 79 sats)
  // ---------------------------------------------------------------------------
  console.log("\n>>> [5/6] Verifying remaining change stored back in Vault...");
  const afterWithdrawalBalance = await getAgentWalletBalance();
  if (afterWithdrawalBalance.totalBalanceSats !== 79) {
    throw new Error(`Expected remaining balance of 79 sats (100 - 21), got ${afterWithdrawalBalance.totalBalanceSats}`);
  }

  const unspentInDb = await getUnspentVaultProofs(mockMint1);
  const dbSum = unspentInDb.reduce((s, p) => s + p.amount, 0);
  if (dbSum !== 79) {
    throw new Error(`Database unspent sum mismatch: expected 79 sats, got ${dbSum}`);
  }
  console.log(`  [+] Vault balance after 21 sats payment: ${afterWithdrawalBalance.totalBalanceSats} sats.`);
  console.log(`  [+] Proof breakdown in DB: ${unspentInDb.map((p) => `${p.amount}s`).join(" + ")} = ${dbSum} sats.`);
  console.log("  [+] Change retention verified successfully.\n");

  // ---------------------------------------------------------------------------
  // TEST 6: Overdraw Protection & Multi-Mint Prioritization
  // ---------------------------------------------------------------------------
  console.log(">>> [6/6] Testing overdraw protection and multi-mint routing...");

  // Test 6a: Attempting to withdraw 100 sats when only 79 available
  let overdrawBlocked = false;
  try {
    await withdrawOrSplitProofsForPayment(100, mockMint1);
  } catch (err: any) {
    overdrawBlocked = true;
    console.log(`  [+] Overdraw correctly blocked: "${err.message}"`);
  }
  if (!overdrawBlocked) {
    throw new Error("Expected withdrawal exceeding vault balance to throw, but succeeded!");
  }

  // Test 6b: Deposit into a second mint (50 sats)
  const mint2Proofs: CashuProof[] = [
    {
      id: "00a2b3c4d5e6f7a8",
      amount: 50,
      secret: "sec_vault_proof_mint2_50_sats",
      C: "02c91fc42f65f04ff7b2b8e30b8054b1f6920ad96781216dd5a6a6669fb8bc76cc",
    },
  ];
  const tokenMint2 = encodeCashuToken(mockMint2, mint2Proofs);
  await depositCashuToken(tokenMint2, { skipMintVerification: true });

  const multiMintBalance = await getAgentWalletBalance();
  if (multiMintBalance.totalBalanceSats !== 129) {
    throw new Error(`Multi-mint total mismatch: expected 129 sats (79 + 50), got ${multiMintBalance.totalBalanceSats}`);
  }
  if (multiMintBalance.mints.length !== 2) {
    throw new Error(`Expected 2 mints, found ${multiMintBalance.mints.length}`);
  }
  console.log(`  [+] Multi-mint balance verified: ${multiMintBalance.totalBalanceSats} sats across 2 mints.`);

  // Test 6c: Specific preferred-mint withdrawal
  const withdrawalFromMint2 = await withdrawOrSplitProofsForPayment(30, mockMint2);
  if (withdrawalFromMint2.mintUrl !== mockMint2) {
    throw new Error(`Preferred mint violated: expected ${mockMint2}, got ${withdrawalFromMint2.mintUrl}`);
  }
  const mint2WithdrawSum = withdrawalFromMint2.sendProofs.reduce((s, p) => s + p.amount, 0);
  if (mint2WithdrawSum !== 30) {
    throw new Error(`Mint 2 withdrawal mismatch: expected 30 sats, got ${mint2WithdrawSum}`);
  }

  const finalBalance = await getAgentWalletBalance();
  // 129 - 30 = 99 sats (Mint 1: 79 sats, Mint 2: 20 sats)
  if (finalBalance.totalBalanceSats !== 99) {
    throw new Error(`Expected final balance 99 sats, got ${finalBalance.totalBalanceSats}`);
  }
  console.log(`  [+] Preferred-mint withdrawal succeeded: 30 sats from Mint 2.`);
  console.log(`  [+] Final aggregated balance: ${finalBalance.totalBalanceSats} sats (Mint 1: 79s, Mint 2: 20s).`);

  // Clean up
  await clearVaultProofs();
  console.log("\n===============================================================================");
  console.log("  ALL STATEFUL CASHU AGENT VAULT TESTS PASSED (100% GREEN)                     ");
  console.log("===============================================================================");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
