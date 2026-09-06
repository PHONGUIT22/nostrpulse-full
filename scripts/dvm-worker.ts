// scripts/dvm-worker.ts
import { SimplePool, finalizeEvent, generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { fetchNostrProfile, calculateTrustScore, DEFAULT_RELAYS } from "@/lib/trust-score";

// Auto-load .env.local or .env if present
try {
  process.loadEnvFile?.(".env.local");
} catch {
  try {
    process.loadEnvFile?.(".env");
  } catch {}
}

/**
 * Initialize DVM Worker Keypair
 * Loads from DVM_SECRET_KEY env variable (hex or nsec) if provided,
 * otherwise generates an ephemeral secret key.
 */
function getWorkerKey(): Uint8Array {
  const envKey = process.env.DVM_SECRET_KEY?.trim();
  if (envKey) {
    try {
      if (envKey.startsWith("nsec1")) {
        const decoded = nip19.decode(envKey);
        if (decoded.type === "nsec") {
          return decoded.data as Uint8Array;
        }
      } else if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
        return Uint8Array.from(Buffer.from(envKey, "hex"));
      }
    } catch (err) {
      console.warn("[DVM] Failed to parse DVM_SECRET_KEY from environment, generating a fresh keypair.", err);
    }
  }

  return generateSecretKey();
}

async function startDvmWorker() {
  console.log("==========================================================");
  console.log("       NOSTRPULSE DATA VENDING MACHINE (DVM) WORKER       ");
  console.log("                 Trust Score Calculation                  ");
  console.log("==========================================================");

  const workerSk = getWorkerKey();
  const workerPk = getPublicKey(workerSk);
  const workerPrivHex = Buffer.from(workerSk).toString("hex");

  console.log(`[Identity] Worker Pubkey : ${workerPk}`);
  console.log(`[Identity] Worker Privkey: ${workerPrivHex}`);
  console.log(`[Relays] Connecting to   : ${DEFAULT_RELAYS.join(", ")}`);
  console.log(`[Filter] Listening for   : Kind 5000 with tag ['t', 'trust-score']`);
  console.log("----------------------------------------------------------\n");

  const pool = new SimplePool();
  const processedJobs = new Set<string>();

  // Subscribe to Kind 5000 Job Request events tagged with "trust-score"
  // Listen for events created recently or arriving live
  const filter: { kinds: number[]; "#t": string[]; since: number } = {
    kinds: [5000],
    "#t": ["trust-score"],
    since: Math.floor(Date.now() / 1000) - 60, // Catch requests from last minute or live
  };

  const sub = pool.subscribeMany(DEFAULT_RELAYS, filter, {
    async onevent(event) {
      // Validate event kind and duplicate processing
      if (event.kind !== 5000) return;
      if (processedJobs.has(event.id)) return;

      // Verify the tag ['t', 'trust-score'] is explicitly present
      const hasTrustScoreTag = event.tags.some(
        (t) => t[0] === "t" && t[1]?.toLowerCase() === "trust-score"
      );
      if (!hasTrustScoreTag) return;

      processedJobs.add(event.id);

      console.log(`\n[DVM] >>> Incoming Job Request detected!`);
      console.log(`[DVM] Job ID    : ${event.id}`);
      console.log(`[DVM] Requester : ${event.pubkey}`);
      console.log(`[DVM] Created At: ${new Date(event.created_at * 1000).toISOString()}`);

      // Extract target pubkey from tag ["i", "<target_pubkey>", "text"]
      const inputTag = event.tags.find((t) => t[0] === "i");
      const targetInput = inputTag ? inputTag[1]?.trim() : null;

      // Determine target relays to send feedback and result
      const relaysTag = event.tags.find((t) => t[0] === "relays");
      const requestedRelays = relaysTag
        ? relaysTag.slice(1).filter((r) => typeof r === "string" && (r.startsWith("wss://") || r.startsWith("ws://")))
        : [];
      const broadcastRelays = Array.from(new Set([...DEFAULT_RELAYS, ...requestedRelays]));

      if (!targetInput) {
        console.warn(`[DVM] Job ${event.id} missing target pubkey in ['i', ...] tag. Sending error feedback.`);
        try {
          const errorFeedback = finalizeEvent(
            {
              kind: 7000,
              created_at: Math.floor(Date.now() / 1000),
              tags: [
                ["e", event.id],
                ["p", event.pubkey],
                ["status", "error"],
              ],
              content: "Error: Missing target pubkey in ['i', '<target_pubkey>', 'text'] tag.",
            },
            workerSk
          );
          await Promise.any(pool.publish(broadcastRelays, errorFeedback));
        } catch (err) {
          console.error("[DVM] Failed to publish error feedback:", err);
        }
        return;
      }

      console.log(`[DVM] Target Pubkey / Handle: ${targetInput}`);

      // Step 1: Send Kind 7000 job feedback with status "processing"
      try {
        const feedbackEvent = finalizeEvent(
          {
            kind: 7000,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              ["e", event.id],
              ["p", event.pubkey],
              ["status", "processing"],
            ],
            content: `Calculating trust score for target ${targetInput}...`,
          },
          workerSk
        );

        console.log(`[DVM] Sending Kind 7000 (status: processing)...`);
        await Promise.any(pool.publish(broadcastRelays, feedbackEvent));
        console.log(`[DVM] Kind 7000 published successfully! ID: ${feedbackEvent.id}`);
      } catch (fbErr) {
        console.warn("[DVM] Warning: Failed to send Kind 7000 feedback event:", fbErr);
      }

      // Step 2: Fetch Nostr profile and calculate trust score
      try {
        console.log(`[DVM] Fetching profile metadata for ${targetInput}...`);
        const profile = await fetchNostrProfile(targetInput, broadcastRelays);

        console.log(`[DVM] Computing multi-factor trust score...`);
        const trustScoreResult = calculateTrustScore(profile);

        console.log(`[DVM] Calculated Trust Score: ${trustScoreResult.score}/100 [${trustScoreResult.tier}]`);

        // Step 3: Sign and publish Kind 6000 containing result JSON and fee demand
        const resultEvent = finalizeEvent(
          {
            kind: 6000,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              ["e", event.id],
              ["p", event.pubkey],
              ["amount", "5000"], // Fee demand: 5 sats = 5000 millisats
              ["i", targetInput, "text"],
              ["t", "trust-score"],
            ],
            content: JSON.stringify(trustScoreResult),
          },
          workerSk
        );

        console.log(`[DVM] Publishing Kind 6000 result event...`);
        await Promise.any(pool.publish(broadcastRelays, resultEvent));
        console.log(`[DVM] >>> SUCCESS! Kind 6000 published!`);
        console.log(`[DVM] Result Event ID: ${resultEvent.id}`);
        console.log(`[DVM] Demanded Amount: 5000 msats (5 sats)`);
      } catch (calcErr) {
        console.error(`[DVM] Error processing Job ${event.id}:`, calcErr);
        try {
          const failureFeedback = finalizeEvent(
            {
              kind: 7000,
              created_at: Math.floor(Date.now() / 1000),
              tags: [
                ["e", event.id],
                ["p", event.pubkey],
                ["status", "error"],
              ],
              content: `Calculation error: ${calcErr instanceof Error ? calcErr.message : String(calcErr)}`,
            },
            workerSk
          );
          await Promise.any(pool.publish(broadcastRelays, failureFeedback));
        } catch {}
      }
    },
    oneose() {
      console.log("[Relay] EOSE reached across initial relay pool. Live listener active...");
    },
  });

  // Handle graceful process shutdown
  const shutdown = () => {
    console.log("\n[DVM] Gracefully shutting down DVM worker...");
    sub.close();
    pool.close(DEFAULT_RELAYS);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startDvmWorker().catch((err) => {
  console.error("[DVM] Fatal worker error:", err);
  process.exit(1);
});
