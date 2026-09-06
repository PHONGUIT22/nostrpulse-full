// scripts/test-dvm-client.ts
import { SimplePool, generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools";
import { DEFAULT_RELAYS } from "@/lib/trust-score";

async function runClientTest() {
  console.log("==========================================================");
  console.log("            DVM TEST CLIENT (KIND 5000 SENDER)            ");
  console.log("==========================================================");

  // 1. Generate an independent test keypair (different private key from worker)
  const clientSk = generateSecretKey();
  const clientPk = getPublicKey(clientSk);
  console.log(`[Client] Pubkey: ${clientPk}`);
  console.log(`[Relays] Connecting to: ${DEFAULT_RELAYS.join(", ")}`);

  const pool = new SimplePool();
  let receivedFeedback = false;
  let receivedResult = false;

  // Target pubkey to evaluate: Jack Dorsey (known core seed in Nostr)
  const targetPubkey = "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a04f9d61825e81d02";

  // 2. Prepare Kind 5000 Job Request
  const jobRequestTemplate = {
    kind: 5000,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["i", targetPubkey, "text"],
      ["t", "trust-score"],
      ["output", "application/json"],
      ["bid", "5000"],
      ["relays", ...DEFAULT_RELAYS],
    ],
    content: "Please calculate trust score",
  };

  const signedJobRequest = finalizeEvent(jobRequestTemplate, clientSk);
  console.log(`[Client] Generated Kind 5000 Job Request ID: ${signedJobRequest.id}\n`);

  // 3. Listen for Kind 7000 (Feedback) and Kind 6000 (Result) referencing our job
  console.log("[Client] Subscribing to Kind 7000 and Kind 6000 responses...");
  const subFilter: { kinds: number[]; "#e": string[]; since: number } = {
    kinds: [6000, 7000],
    "#e": [signedJobRequest.id],
    since: Math.floor(Date.now() / 1000) - 10,
  };

  const sub = pool.subscribeMany(DEFAULT_RELAYS, subFilter, {
    onevent(event) {
      if (event.kind === 7000) {
        receivedFeedback = true;
        const statusTag = event.tags.find((t) => t[0] === "status");
        console.log(`\n>>> [FEEDBACK RECEIVED - Kind 7000]`);
        console.log(`    From Worker: ${event.pubkey}`);
        console.log(`    Status     : ${statusTag ? statusTag[1] : "unknown"}`);
        console.log(`    Message    : ${event.content}`);
      }

      if (event.kind === 6000) {
        receivedResult = true;
        const amountTag = event.tags.find((t) => t[0] === "amount");
        console.log(`\n==========================================================`);
        console.log(`>>> [RESULT RECEIVED - Kind 6000 SUCCESS!]`);
        console.log(`    From Worker: ${event.pubkey}`);
        console.log(`    Event ID   : ${event.id}`);
        console.log(`    Amount tag : ${amountTag ? amountTag[1] + " msats (5 sats)" : "missing"}`);
        console.log(`    Content JSON:`);
        try {
          const parsed = JSON.parse(event.content);
          console.log(`    -> Score : ${parsed.score}/100`);
          console.log(`    -> Tier  : ${parsed.tier}`);
          console.log(`    -> Summary: ${parsed.summary}`);
        } catch {
          console.log(`    Raw content: ${event.content}`);
        }
        console.log(`==========================================================\n`);

        console.log("TEST PASSED: Worker successfully replied with Kind 6000!");
        sub.close();
        pool.close(DEFAULT_RELAYS);
        process.exit(0);
      }
    },
    oneose() {
      console.log("[Client] Relay subscription ready.");
    },
  });

  // Give subscription a moment to connect to relays
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 4. Publish Kind 5000 request
  console.log(`[Client] Publishing Kind 5000 request to relays...`);
  try {
    await Promise.any(pool.publish(DEFAULT_RELAYS, signedJobRequest));
    console.log(`[Client] Published successfully! Waiting for DVM worker to respond...\n`);
  } catch (err) {
    console.error(`[Client] Failed to publish Kind 5000 request:`, err);
    sub.close();
    pool.close(DEFAULT_RELAYS);
    process.exit(1);
  }

  // Timeout after 30 seconds if no response
  setTimeout(() => {
    if (!receivedResult) {
      console.error("\n[Client] TIMEOUT: Did not receive Kind 6000 within 30 seconds.");
      sub.close();
      pool.close(DEFAULT_RELAYS);
      process.exit(1);
    }
  }, 30000);
}

runClientTest().catch((err) => {
  console.error("[Client] Error running test:", err);
  process.exit(1);
});
