// scripts/test-http402-full-loop.ts
/**
 * Integration Test Suite: Two-Sided HTTP 402 Full Loop
 *
 * Bridges Client SDK (`NostrPulseAgent.fetch402`) <-> Server SDK (`withHttp402Paywall`)
 * over a real local node:http server using Web Standard Request/Response handlers:
 * 1. Unpaid request -> HTTP 402 with X-Cashu creqA... and WWW-Authenticate L402 headers
 * 2. Full-Loop Cashu NUT-24 payment (100 -> 90 sats) + onPaymentReceived hook
 * 3. Anti-Replay Attack protection blocking re-submission of the exact same Cashu token
 * 4. Full-Loop Lightning L402 payment with HMAC-SHA256 macaroon & SHA256(preimage) check
 * 5. Fail-Closed tamper rejection for forged L402 preimage & invalid macaroon signature
 */

import { createHash } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createAgentWallet } from "../src/lib/agent-facade";
import { encodeCashuToken, parseCashuToken, type CashuProof } from "../src/lib/cashu";
import { clearVaultProofs, getDb, initDatabase } from "../src/lib/db";
import {
  resetServerReplayCacheForTests,
  withHttp402Paywall,
  type ServerPaymentReceipt,
} from "../src/lib/http402-server";

async function main() {
  console.log("===============================================================================");
  console.log("  TEST: HTTP 402 TWO-SIDED FULL LOOP (AGENT CLIENT <-> SERVER PAYWALL)         ");
  console.log("===============================================================================\n");

  await initDatabase();
  const db = getDb();
  await clearVaultProofs();
  await db.execute("DELETE FROM agent_spending_log");
  resetServerReplayCacheForTests();

  const mockMint = "https://mock-mint.nostrpulse.org";
  const serverMacaroonSecret = "nostrpulse-server-hmac-secret-full-loop-test";
  const l402Preimage = "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";
  const l402PaymentHash = createHash("sha256")
    .update(Buffer.from(l402Preimage, "hex"))
    .digest("hex");

  const serverReceipts: ServerPaymentReceipt[] = [];
  let capturedCashuToken: string | null = null;
  let capturedL402ChallengeHeader: string | null = null;
  let handlerExecutions = 0;

  // Protected Web Standard handler wrapped by withHttp402Paywall
  const protectedRouteHandler = withHttp402Paywall(
    async (_req, _ctx, receipt) => {
      handlerExecutions += 1;
      return new Response(
        JSON.stringify({
          unlocked: true,
          message: "Welcome to the sovereign AI paywalled API!",
          receipt: {
            rail: receipt.rail,
            amountSats: receipt.amountSats,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    },
    {
      amountSats: 10,
      acceptedMints: [mockMint],
      description: "Full-loop premium AI endpoint (10 sats)",
      enableCashu: true,
      enableL402: true,
      macaroonSecret: serverMacaroonSecret,
      customCashuVerifier: async (token, expectedSats) => {
        capturedCashuToken = token;
        const parsed = parseCashuToken(token);
        return {
          valid: parsed.totalAmountSats >= expectedSats,
          claimedToken: token,
          mintUrl: parsed.mint,
          amountSats: parsed.totalAmountSats,
        };
      },
      customInvoiceCreator: async () => ({
        invoice: "lnbc100n1p0mockfull402invoice",
        paymentHash: l402PaymentHash,
      }),
      onPaymentReceived: async (receipt) => {
        serverReceipts.push(receipt);
      },
    }
  );

  // Bridge Node HTTP server -> Web Standard Request/Response
  const server = http.createServer(async (req, res) => {
    try {
      const address = server.address() as AddressInfo;
      const fullUrl = `http://127.0.0.1:${address.port}${req.url || "/"}`;

      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(", "));
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks);

      const webReq = new Request(fullUrl, {
        method: req.method || "GET",
        headers,
        body:
          req.method && req.method !== "GET" && req.method !== "HEAD" && rawBody.length > 0
            ? rawBody
            : undefined,
      });

      const webRes = await protectedRouteHandler(webReq);
      const outHeaders: Record<string, string> = {};
      webRes.headers.forEach((value, key) => {
        outHeaders[key] = value;
      });
      res.writeHead(webRes.status, outHeaders);
      const bodyText = await webRes.text();
      res.end(bodyText);
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err?.message || String(err) }));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address() as AddressInfo;
    const premiumUrl = `http://127.0.0.1:${address.port}/premium`;

    // Initialize client NostrPulseAgent wallet and fund with 100 sats
    const wallet = createAgentWallet({
      maxSingleTxSats: 50,
      maxDailySats: 200,
      minTrustScore: 50,
    });

    const mockProofs: CashuProof[] = [
      {
        id: "009a1f293252f338",
        amount: 100,
        secret: `sec_full_loop_100_${Date.now()}`,
        C: "02b90fc42f65f04ff7b2b8e30b8054b1f6920ad96781216dd5a6a6669fb8bc76ba",
      },
    ];
    await wallet.deposit(encodeCashuToken(mockMint, mockProofs), {
      skipRemoteVerify: true,
    });

    // -------------------------------------------------------------------------
    // TEST 1: Unpaid Request -> 402 Challenge with X-Cashu + WWW-Authenticate
    // -------------------------------------------------------------------------
    console.log(">>> [1/5] Sending unpaid request to withHttp402Paywall endpoint...");
    const unpaidRes = await fetch(premiumUrl);
    const xCashuHeader = unpaidRes.headers.get("x-cashu");
    const wwwAuthHeader = unpaidRes.headers.get("www-authenticate");
    capturedL402ChallengeHeader = wwwAuthHeader;

    if (
      unpaidRes.status !== 402 ||
      !xCashuHeader?.startsWith("creqA") ||
      !wwwAuthHeader?.startsWith("L402 macaroon=")
    ) {
      throw new Error(
        `Expected 402 with X-Cashu and L402 headers, got status=${unpaidRes.status}, x-cashu=${xCashuHeader}, www-auth=${wwwAuthHeader}`
      );
    }
    if (handlerExecutions !== 0) {
      throw new Error("Protected handler must NOT run on unpaid 402 challenge!");
    }
    console.log(`  [+] Received HTTP 402 with X-Cashu="${xCashuHeader.slice(0, 24)}..." and WWW-Authenticate L402.\n`);

    // -------------------------------------------------------------------------
    // TEST 2: Full-Loop Cashu NUT-24 Payment (100 sats -> 90 sats)
    // -------------------------------------------------------------------------
    console.log(">>> [2/5] Paying via NostrPulseAgent.fetch402() using Cashu NUT-24...");
    const cashuPaidRes = await wallet.fetch402(premiumUrl, {
      allowLocalhost: true,
    });

    if (
      !cashuPaidRes.ok ||
      cashuPaidRes.status !== 200 ||
      cashuPaidRes.paymentStatus !== "paid" ||
      cashuPaidRes.rail !== "cashu_402" ||
      cashuPaidRes.amountPaidSats !== 10 ||
      !cashuPaidRes.json?.unlocked
    ) {
      throw new Error(`Cashu NUT-24 full loop failed: ${JSON.stringify(cashuPaidRes)}`);
    }

    const receiptHeader = cashuPaidRes.headers["x-nostrpulse-receipt"];
    if (!receiptHeader || !receiptHeader.includes("cashu_402")) {
      throw new Error(`Expected X-NostrPulse-Receipt header in response, got ${receiptHeader}`);
    }

    const balAfterCashu = await wallet.getBalance();
    if (balAfterCashu.totalBalanceSats !== 90) {
      throw new Error(`Expected 90 sats remaining, got ${balAfterCashu.totalBalanceSats}`);
    }
    if (serverReceipts.length !== 1 || serverReceipts[0].rail !== "cashu_402") {
      throw new Error(`Expected onPaymentReceived hook for cashu_402, got ${JSON.stringify(serverReceipts)}`);
    }
    console.log(
      `  [+] Client paid 10 sats -> HTTP 200 OK, onPaymentReceived fired, Vault balance: ${balAfterCashu.totalBalanceSats} sats.\n`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Anti-Replay Attack (Re-submitting exact same Cashu token)
    // -------------------------------------------------------------------------
    console.log(">>> [3/5] Replaying exact same Cashu token to test double-spend protection...");
    if (!capturedCashuToken) {
      throw new Error("Expected capturedCashuToken from step 2");
    }
    const execCountBeforeReplay = handlerExecutions;
    const replayRes = await fetch(premiumUrl, {
      headers: { "X-Cashu": capturedCashuToken },
    });
    const replayJson = (await replayRes.json()) as any;
    if (replayRes.status !== 402 || handlerExecutions !== execCountBeforeReplay) {
      throw new Error(
        `Replay attack was NOT blocked! status=${replayRes.status}, body=${JSON.stringify(replayJson)}`
      );
    }
    console.log(`  [+] Replay blocked with HTTP 402: "${replayJson.error}"\n`);

    // -------------------------------------------------------------------------
    // TEST 4: Full-Loop Lightning L402 Payment (HMAC-SHA256 + preimage check)
    // -------------------------------------------------------------------------
    console.log(">>> [4/5] Paying via NostrPulseAgent.fetch402() using Lightning L402...");
    const l402PaidRes = await wallet.fetch402(premiumUrl, {
      allowLocalhost: true,
      preferRail: "l402",
      customInvoicePayer: async (_invoice, amountSats) => {
        if (amountSats !== 10) {
          throw new Error(`Expected L402 amountSats 10, got ${amountSats}`);
        }
        return { preimage: l402Preimage };
      },
    });

    if (
      !l402PaidRes.ok ||
      l402PaidRes.status !== 200 ||
      l402PaidRes.paymentStatus !== "paid" ||
      l402PaidRes.rail !== "l402" ||
      !l402PaidRes.json?.unlocked
    ) {
      throw new Error(`Lightning L402 full loop failed: ${JSON.stringify(l402PaidRes)}`);
    }
    if (Number(serverReceipts.length) !== 2 || serverReceipts[1].rail !== "l402") {
      throw new Error(`Expected onPaymentReceived hook for l402, got ${JSON.stringify(serverReceipts)}`);
    }
    console.log(
      `  [+] Client settled L402 via HMAC-verified macaroon -> HTTP 200 OK, onPaymentReceived count=${serverReceipts.length}.\n`
    );

    // -------------------------------------------------------------------------
    // TEST 5: Security Tampering Block (Fake Preimage & Forged Macaroon Sig)
    // -------------------------------------------------------------------------
    console.log(">>> [5/5] Testing Fail-Closed blocking for tampered L402 credentials...");
    const macMatch = capturedL402ChallengeHeader?.match(/macaroon="([^"]+)"/i);
    if (!macMatch?.[1]) {
      throw new Error("Missing macaroon from captured WWW-Authenticate header");
    }
    const validMacaroon = macMatch[1];
    const execCountBeforeTamper = handlerExecutions;

    const fakePreimage = "ff".repeat(32);
    const fakePreimageRes = await fetch(premiumUrl, {
      headers: { Authorization: `L402 ${validMacaroon}:${fakePreimage}` },
    });
    const fakePreimageJson = (await fakePreimageRes.json()) as any;
    if (fakePreimageRes.status !== 402 || handlerExecutions !== execCountBeforeTamper) {
      throw new Error(`Fake preimage was NOT rejected with 402: status=${fakePreimageRes.status}`);
    }

    const [macPayload] = validMacaroon.split(".");
    const tamperedMacaroon = `${macPayload}.tamperedSignature0000000000000000`;
    const tamperedSigRes = await fetch(premiumUrl, {
      headers: { Authorization: `L402 ${tamperedMacaroon}:${l402Preimage}` },
    });
    const tamperedSigJson = (await tamperedSigRes.json()) as any;
    if (tamperedSigRes.status !== 402 || handlerExecutions !== execCountBeforeTamper) {
      throw new Error(`Tampered macaroon was NOT rejected with 402: status=${tamperedSigRes.status}`);
    }

    console.log(`  [+] Fake preimage rejected (HTTP 402): "${fakePreimageJson.error}"`);
    console.log(`  [+] Tampered macaroon rejected (HTTP 402): "${tamperedSigJson.error}"\n`);

    console.log("===============================================================================");
    console.log("  ALL HTTP 402 TWO-SIDED FULL-LOOP TESTS PASSED (100% GREEN)                   ");
    console.log("===============================================================================");
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}

main().catch((err) => {
  console.error("\n[FAILED] HTTP 402 Two-Sided Full Loop test suite failed:", err);
  process.exit(1);
});
