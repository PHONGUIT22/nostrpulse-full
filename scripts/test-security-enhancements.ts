// scripts/test-security-enhancements.ts
import { isSafeExternalUrl, isPrivateOrLocalHost } from "../src/lib/ssrf";
import { KeyedAsyncMutex } from "../src/lib/cashu";
import { resolveRecipientTrustScore } from "../src/lib/guardrails";
import { resolveWebOfTrustDistance, getWebOfTrustDistance } from "../src/lib/wot";

async function runSecurityTests() {
  console.log("===============================================================================");
  console.log("  TEST: SECURITY & RELIABILITY ENHANCEMENTS                                    ");
  console.log("===============================================================================\n");

  // ===========================================================================
  // Section 1: SSRF Protection (isSafeExternalUrl & isPrivateOrLocalHost)
  // ===========================================================================
  console.log("[Section 1] Testing SSRF Protection against internal & loopback targets...");

  // Blocked hosts
  const blockedUrls = [
    "http://localhost:3338",
    "https://localhost/v1/info",
    "http://127.0.0.1:8080",
    "http://127.0.0.2:3000",
    "http://0.0.0.0",
    "http://[::1]:8080",
    "http://[::]:8080",
    "http://10.0.0.1/admin",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1",
    "http://mint.local",
    "http://node.internal",
    "http://router.lan",
    "ftp://mint.example.com",
    "file:///etc/passwd",
    "javascript:alert(1)",
  ];

  for (const url of blockedUrls) {
    const isSafe = isSafeExternalUrl(url);
    if (isSafe) {
      throw new Error(`SSRF vulnerability detected! URL should be BLOCKED but was allowed: ${url}`);
    }
  }
  console.log(`  ✔ Successfully blocked ${blockedUrls.length} internal/loopback/cloud-metadata URLs.`);

  // Allowed public hosts
  const allowedUrls = [
    "https://testnut.cashu.space",
    "https://mint.minibits.cash/Bitcoin",
    "https://mint.macadamia.cash",
    "https://relay.damus.io",
    "http://example.com/v1/info",
    "https://fdroid.org",
    "https://fcm.googleapis.com",
  ];

  for (const url of allowedUrls) {
    const isSafe = isSafeExternalUrl(url);
    if (!isSafe) {
      throw new Error(`Safe external URL was incorrectly blocked: ${url}`);
    }
  }
  console.log(`  ✔ Successfully allowed ${allowedUrls.length} valid public external URLs.`);

  // ALLOW_LOCAL_MINTS override test
  process.env.ALLOW_LOCAL_MINTS = "true";
  if (!isSafeExternalUrl("http://localhost:3338")) {
    throw new Error("ALLOW_LOCAL_MINTS=true should allow localhost connections.");
  }
  delete process.env.ALLOW_LOCAL_MINTS;
  if (isSafeExternalUrl("http://localhost:3338")) {
    throw new Error("ALLOW_LOCAL_MINTS disabled should block localhost connections again.");
  }
  console.log("  ✔ ALLOW_LOCAL_MINTS dynamic environment flag verified.\n");

  // ===========================================================================
  // Section 2: KeyedAsyncMutex Concurrent Race Condition Protection
  // ===========================================================================
  console.log("[Section 2] Testing KeyedAsyncMutex FIFO concurrency serialization...");

  const mutex = new KeyedAsyncMutex();
  const executionOrder: number[] = [];
  const testKey = "https://mint.example.com:test-token-proofs";

  // Simulate 3 concurrent operations hitting the exact same token/mint
  const op1 = mutex.runExclusive(testKey, async () => {
    await new Promise((r) => setTimeout(r, 60));
    executionOrder.push(1);
    return "result1";
  });

  const op2 = mutex.runExclusive(testKey, async () => {
    await new Promise((r) => setTimeout(r, 30));
    executionOrder.push(2);
    return "result2";
  });

  const op3 = mutex.runExclusive(testKey, async () => {
    await new Promise((r) => setTimeout(r, 10));
    executionOrder.push(3);
    return "result3";
  });

  const results = await Promise.all([op1, op2, op3]);

  if (JSON.stringify(executionOrder) !== JSON.stringify([1, 2, 3])) {
    throw new Error(`Mutex queue race condition! Expected [1, 2, 3] but got ${JSON.stringify(executionOrder)}`);
  }
  if (results[0] !== "result1" || results[1] !== "result2" || results[2] !== "result3") {
    throw new Error("Mutex returned incorrect return values.");
  }
  console.log("  ✔ KeyedAsyncMutex successfully serialized concurrent tasks into strict FIFO order.\n");

  // ===========================================================================
  // Section 3: Web-of-Trust Hop 0 / Hop 1 / Hop 2 Resolution
  // ===========================================================================
  console.log("[Section 3] Testing resolveRecipientTrustScore with Hop-2 Transitive WoT...");

  // Fiatjaf (Root Seed Anchor -> Hop 0)
  const fiatjafPubkey = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
  const fiatjafScore = await resolveRecipientTrustScore(fiatjafPubkey);
  console.log(`  ✔ Fiatjaf (Hop 0 Root Anchor) Trust Score: ${fiatjafScore}/100 (>= 75)`);
  if (fiatjafScore < 75) {
    throw new Error(`Fiatjaf should have high trust score, got: ${fiatjafScore}`);
  }

  // Unknown / random keypair -> resolved via resolveWebOfTrustDistance without hanging
  const randomHex = "1111111111111111111111111111111111111111111111111111111111111111";
  const startMs = Date.now();
  const unknownWot = await resolveWebOfTrustDistance(randomHex, { timeoutMs: 1500 });
  const duration = Date.now() - startMs;
  console.log(`  ✔ Unknown Keypair WoT distance resolved to: ${unknownWot.distance} within ${duration}ms (timeout protected)`);
  if (unknownWot.distance !== 3 && unknownWot.distance !== 2) {
    throw new Error(`Unexpected distance for unknown key: ${unknownWot.distance}`);
  }

  console.log("\n===============================================================================");
  console.log("  ALL SECURITY & RELIABILITY ENHANCEMENTS VERIFIED SUCCESSFULLY!              ");
  console.log("===============================================================================");
}

runSecurityTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
