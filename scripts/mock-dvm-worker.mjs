// scripts/mock-dvm-worker.mjs
// Mock DVM Worker listening for Kind 5000 tasks and publishing Kind 6000 results
import { SimplePool, finalizeEvent, generateSecretKey } from "nostr-tools";

const pool = new SimplePool();
const relays = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];
const sk = generateSecretKey();

console.log("Mock DVM Worker is listening for Kind 5000 events...");

pool.subscribeMany(
  relays,
  [
    {
      kinds: [5000],
      "#t": ["nostrpulse-task"],
      since: Math.floor(Date.now() / 1000) - 120,
    },
  ],
  {
    onevent(event) {
      console.log("[DVM] Caught task:", event.id);

      const resultTemplate = {
        kind: 6000,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["e", event.id],
          ["p", event.pubkey],
          ["amount", "21000"],
        ],
        content: JSON.stringify({
          score: 96,
          tier: "Verified Builder",
          summary: "Task processed successfully by local DVM worker.",
        }),
      };

      const signed = finalizeEvent(resultTemplate, sk);
      const pubs = pool.publish(relays, signed);
      Promise.allSettled(pubs).then(() => {
        console.log("[DVM] Published Kind 6000 result to relays for task:", event.id);
      });
    },
  }
);
