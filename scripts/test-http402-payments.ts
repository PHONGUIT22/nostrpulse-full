// scripts/test-http402-payments.ts
/**
 * Integration Test Suite: Bitcoin-Native HTTP 402 Paywall Engine
 *
 * Uses a real local node:http server on 127.0.0.1 to verify end-to-end:
 * 1. NUT-24 X-Cashu 402 challenge -> Vault split (100 -> 15 + 85 sats) -> 200 OK
 * 2. Lightning L402 challenge -> BOLT11 decoding & preimage auth -> 200 OK
 * 3. Spending Guardrails enforcement on overpriced 402 paywalls (500 > 50 sats)
 * 4. Pre-flight SSRF Guard blocking internal metadata targets (169.254.169.254)
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { createAgentWallet } from "../src/lib/agent-facade";
import { encodeCashuToken, parseCashuToken, type CashuProof } from "../src/lib/cashu";
import { clearVaultProofs, getDb, initDatabase } from "../src/lib/db";
import { encodeCashu402Request } from "../src/lib/http402";

async function main() {
  console.log("===============================================================================");
  console.log("  TEST: HTTP 402 PAYWALL ENGINE (L402 LIGHTNING + CASHU NUT-24 X-CASHU)        ");
  console.log("===============================================================================\n");

  // Reset SQLite database state for deterministic balance & guardrail assertions
  await initDatabase();
  const db = getDb();
  await clearVaultProofs();
  await db.execute("DELETE FROM agent_spending_log");

  const mockMint = "https://mock-mint.nostrpulse.org";
  const mockMacaroon = "mockmacaroon123";
  const mockPreimage = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

  // Spin up local HTTP 402 server on ephemeral loopback port
  const server = http.createServer((req, res) => {
    const reqUrl = req.url || "/";

    if (reqUrl === "/paid-cashu") {
      const xCashu = req.headers["x-cashu"];
      if (typeof xCashu === "string" && xCashu.trim()) {
        try {
          const decoded = parseCashuToken(xCashu.trim());
          if (decoded.totalAmountSats === 15) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                secret: "nut24-cashu-secret-payload",
                paidSats: decoded.totalAmountSats,
                mint: decoded.mint,
              })
            );
            return;
          }
        } catch {
          // Fall through to 402 if token invalid
        }
      }

      const creq = encodeCashu402Request({
        amountSats: 15,
        unit: "sat",
        mints: [mockMint],
        id: "nut24_order_15sats",
        description: "Access /paid-cashu API endpoint",
      });

      res.writeHead(402, {
        "Content-Type": "application/json",
        "X-Cashu": creq,
      });
      res.end(JSON.stringify({ error: "Payment Required (NUT-24 X-Cashu)" }));
      return;
    }

    if (reqUrl === "/paid-l402") {
      const authHeader = req.headers["authorization"];
      if (authHeader === `L402 ${mockMacaroon}:${mockPreimage}`) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            secret: "l402-lightning-secret-payload",
            authenticated: true,
          })
        );
        return;
      }

      res.writeHead(402, {
        "Content-Type": "application/json",
        "WWW-Authenticate": `L402 macaroon="${mockMacaroon}", invoice="lnbc200n1p0mockinvoice402test"`,
      });
      res.end(JSON.stringify({ error: "Payment Required (L402 Lightning)" }));
      return;
    }

    if (reqUrl === "/overpriced") {
      const creq = encodeCashu402Request({
        amountSats: 500,
        unit: "sat",
        mints: [mockMint],
        id: "nut24_overpriced_500sats",
      });
      res.writeHead(402, {
        "Content-Type": "application/json",
        "X-Cashu": creq,
      });
      res.end(JSON.stringify({ error: "Expensive 500-sat paywall" }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    // Initialize NostrPulseAgent with 50-sat per-tx limit and deposit 100 sats
    const wallet = createAgentWallet({
      maxSingleTxSats: 50,
      maxDailySats: 200,
      minTrustScore: 50,
    });

    const mockProofs: CashuProof[] = [
      {
        id: "009a1f293252f338",
        amount: 100,
        secret: `sec_http402_test_100_${Date.now()}`,
        C: "02b90fc42f65f04ff7b2b8e30b8054b1f6920ad96781216dd5a6a6669fb8bc76ba",
      },
    ];
    const seedToken = encodeCashuToken(mockMint, mockProofs);
    const dep = await wallet.deposit(seedToken, { skipRemoteVerify: true });
    if (dep.newTotalBalance !== 100) {
      throw new Error(`Expected initial deposited balance 100 sats, got ${dep.newTotalBalance}`);
    }

    // -------------------------------------------------------------------------
    // TEST 1: NUT-24 X-Cashu 402 End-to-End (15 sats paid -> 85 sats remaining)
    // -------------------------------------------------------------------------
    console.log(">>> [1/4] Testing Cashu NUT-24 (X-Cashu) HTTP 402 auto-payment...");
    const cashuRes = await wallet.fetch402(`${baseUrl}/paid-cashu`, {
      allowLocalhost: true,
    });

    if (
      !cashuRes.ok ||
      cashuRes.status !== 200 ||
      cashuRes.paymentStatus !== "paid" ||
      cashuRes.rail !== "cashu_402" ||
      cashuRes.amountPaidSats !== 15 ||
      cashuRes.json?.secret !== "nut24-cashu-secret-payload"
    ) {
      throw new Error(`NUT-24 X-Cashu 402 test failed: ${JSON.stringify(cashuRes)}`);
    }

    const balAfterCashu = await wallet.getBalance();
    if (balAfterCashu.totalBalanceSats !== 85) {
      throw new Error(
        `Expected 85 sats remaining in vault after 15-sat NUT-24 payment, got ${balAfterCashu.totalBalanceSats}`
      );
    }
    console.log(
      `  [+] Paid 15 sats via NUT-24 X-Cashu -> HTTP ${cashuRes.status}, secret="${cashuRes.json.secret}"`
    );
    console.log(`  [+] Vault balance verified: ${balAfterCashu.totalBalanceSats} sats remaining.\n`);

    // -------------------------------------------------------------------------
    // TEST 2: Lightning L402 End-to-End (20 sats via lnbc200n1...)
    // -------------------------------------------------------------------------
    console.log(">>> [2/4] Testing Lightning L402 HTTP 402 auto-payment...");
    const l402Res = await wallet.fetch402(`${baseUrl}/paid-l402`, {
      allowLocalhost: true,
      customInvoicePayer: async (_invoice, amountSats) => {
        if (amountSats !== 20) {
          throw new Error(`Expected decoded L402 invoice amount 20 sats, got ${amountSats}`);
        }
        return { preimage: mockPreimage };
      },
    });

    if (
      !l402Res.ok ||
      l402Res.status !== 200 ||
      l402Res.paymentStatus !== "paid" ||
      l402Res.rail !== "l402" ||
      l402Res.amountPaidSats !== 20 ||
      l402Res.preimage !== mockPreimage ||
      l402Res.json?.secret !== "l402-lightning-secret-payload"
    ) {
      throw new Error(`Lightning L402 402 test failed: ${JSON.stringify(l402Res)}`);
    }
    console.log(
      `  [+] Paid 20 sats via L402 -> HTTP ${l402Res.status}, preimage=${l402Res.preimage?.slice(0, 12)}..., secret="${l402Res.json.secret}"\n`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Guardrail Protection against overpriced 500-sat 402 challenge
    // -------------------------------------------------------------------------
    console.log(">>> [3/4] Testing Spending Guardrails blocking overpriced 500-sat 402...");
    const blockedRes = await wallet.fetch402(`${baseUrl}/overpriced`, {
      allowLocalhost: true,
    });

    if (blockedRes.ok || blockedRes.paymentStatus !== "blocked_by_guardrails") {
      throw new Error(
        `Expected overpriced 402 to be blocked_by_guardrails, got ${JSON.stringify(blockedRes)}`
      );
    }

    const balAfterBlock = await wallet.getBalance();
    if (balAfterBlock.totalBalanceSats !== 85) {
      throw new Error(
        `Expected vault balance preserved at 85 sats after guardrail block, got ${balAfterBlock.totalBalanceSats}`
      );
    }
    console.log(`  [+] Blocked 500-sat paywall: "${blockedRes.error}"`);
    console.log(`  [+] Vault balance preserved intact at ${balAfterBlock.totalBalanceSats} sats.\n`);

    // -------------------------------------------------------------------------
    // TEST 4: SSRF Guard blocking cloud metadata IP (169.254.169.254)
    // -------------------------------------------------------------------------
    console.log(">>> [4/4] Testing SSRF Guard blocking internal metadata URL...");
    const ssrfRes = await wallet.fetch402("http://169.254.169.254/latest/meta-data/");
    if (ssrfRes.ok || ssrfRes.status !== 0 || ssrfRes.paymentStatus !== "blocked_ssrf") {
      throw new Error(`Expected blocked_ssrf for metadata IP, got ${JSON.stringify(ssrfRes)}`);
    }
    console.log(`  [+] Blocked SSRF target: "${ssrfRes.error}"\n`);

    console.log("===============================================================================");
    console.log("  ALL HTTP 402 PAYWALL ENGINE TESTS PASSED (100% GREEN)                        ");
    console.log("===============================================================================");
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}

main().catch((err) => {
  console.error("\n[FAILED] HTTP 402 Paywall Engine test suite failed:", err);
  process.exit(1);
});
