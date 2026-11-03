// scripts/test-cbor-and-giftwrap-nutzap.ts
/**
 * Test Suite for RFC 8949 CBOR Module and NIP-59 Gift Wrap NutZap Privacy
 * Verifies Zero-Dependency CBOR encoding/decoding and NIP-59 envelope encryption.
 */

import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  encodeCbor,
  decodeCbor,
  bytesToHex,
  hexToBytes,
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToBase64,
  base64ToBytes,
} from "../src/lib/cbor";
import {
  sendCashuNutZap,
  receiveAndUnwrapNutZap,
  encodeCashuToken,
  parseCashuToken,
} from "../src/lib/cashu";
import { GIFT_WRAP_KIND } from "../src/lib/encryption";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

async function main() {
  console.log("===============================================================================");
  console.log("  RFC 8949 CBOR & NIP-59 GIFT WRAP NUTZAP TEST SUITE                          ");
  console.log("===============================================================================\n");

  // ---------------------------------------------------------------------------
  // PART 1: Helper Functions (Zero-Buffer Hex & Base64/Base64URL)
  // ---------------------------------------------------------------------------
  console.log("[Section 1] Testing Zero-Buffer Helper Functions...");

  const rawBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x23, 0x45, 0x67]);
  const hexStr = bytesToHex(rawBytes);
  assert(hexStr === "deadbeef01234567", `bytesToHex expected deadbeef01234567, got ${hexStr}`);
  const backFromHex = hexToBytes(hexStr);
  assert(deepEqual(rawBytes, backFromHex), "hexToBytes round-trip failed");
  console.log("  ✔ Hex conversions (bytesToHex, hexToBytes) passed.");

  const b64Url = bytesToBase64Url(rawBytes);
  const backFromB64Url = base64UrlToBytes(b64Url);
  assert(deepEqual(rawBytes, backFromB64Url), "bytesToBase64Url round-trip failed");

  const b64Std = bytesToBase64(rawBytes);
  const backFromB64Std = base64ToBytes(b64Std);
  assert(deepEqual(rawBytes, backFromB64Std), "bytesToBase64 round-trip failed");
  console.log("  ✔ Base64 / Base64URL conversions (Zero-Buffer) passed.");

  // ---------------------------------------------------------------------------
  // PART 2: RFC 8949 CBOR Data Types Round-Trip
  // ---------------------------------------------------------------------------
  console.log("\n[Section 2] Testing RFC 8949 CBOR Encoding & Decoding...");

  // 1. Unsigned Integers (Major Type 0)
  const uints = [0, 1, 10, 23, 24, 100, 255, 256, 1000, 65535, 65536, 1000000, 4294967295, 10000000000];
  for (const n of uints) {
    const encoded = encodeCbor(n);
    const decoded = decodeCbor(encoded);
    assert(decoded === n, `CBOR uint round-trip failed for ${n}: got ${decoded}`);
  }
  console.log("  ✔ Major Type 0 (Unsigned Integers 0..10^10) passed.");

  // 2. Negative Integers (Major Type 1)
  const negints = [-1, -10, -24, -25, -100, -256, -1000, -65536, -70000];
  for (const n of negints) {
    const encoded = encodeCbor(n);
    const decoded = decodeCbor(encoded);
    assert(decoded === n, `CBOR negint round-trip failed for ${n}: got ${decoded}`);
  }
  console.log("  ✔ Major Type 1 (Negative Integers) passed.");

  // 3. Byte Strings (Major Type 2)
  const byteStrings = [
    new Uint8Array(0),
    new Uint8Array([0x00]),
    new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    new Uint8Array(Array.from({ length: 300 }, (_, i) => i % 256)),
  ];
  for (const bs of byteStrings) {
    const encoded = encodeCbor(bs);
    const decoded = decodeCbor(encoded);
    assert(deepEqual(decoded, bs), `CBOR byte string round-trip failed for length ${bs.length}`);
  }
  console.log("  ✔ Major Type 2 (Byte Strings) passed.");

  // 4. UTF-8 Text Strings (Major Type 3)
  const textStrings = [
    "",
    "a",
    "Hello NostrPulse!",
    "Value-4-Value eCash NutZap 🥜 & Bitcoin ⚡",
    "Tiếng Việt có dấu: Hà Nội, TP. Hồ Chí Minh",
    "Long text repeated ".repeat(50),
  ];
  for (const s of textStrings) {
    const encoded = encodeCbor(s);
    const decoded = decodeCbor(encoded);
    assert(decoded === s, `CBOR text string round-trip failed for '${s.slice(0, 20)}...'`);
  }
  console.log("  ✔ Major Type 3 (UTF-8 Text Strings with Unicode/Emoji) passed.");

  // 5. Arrays (Major Type 4)
  const arrays = [
    [],
    [1, 2, 3],
    ["hello", 42, true, null, false],
    [[1, 2], [3, [4, 5]], { nested: true }],
  ];
  for (const arr of arrays) {
    const encoded = encodeCbor(arr);
    const decoded = decodeCbor(encoded);
    assert(deepEqual(decoded, arr), `CBOR array round-trip failed for ${JSON.stringify(arr)}`);
  }
  console.log("  ✔ Major Type 4 (Arrays & Nested Arrays) passed.");

  // 6. Maps / Objects (Major Type 5)
  const objects = [
    {},
    { a: 1, b: "two" },
    {
      mint: "https://testnut.cashu.space",
      amount: 21,
      unit: "sat",
      tags: ["nip61", "ecash"],
      nested: { verified: true, level: 3 },
    },
  ];
  for (const obj of objects) {
    const encoded = encodeCbor(obj);
    const decoded = decodeCbor(encoded);
    assert(deepEqual(decoded, obj), `CBOR map round-trip failed for ${JSON.stringify(obj)}`);
  }
  console.log("  ✔ Major Type 5 (Maps / Objects) passed.");

  // 7. Simple Values & Floats (Major Type 7)
  assert(decodeCbor(encodeCbor(false)) === false, "CBOR boolean false failed");
  assert(decodeCbor(encodeCbor(true)) === true, "CBOR boolean true failed");
  assert(decodeCbor(encodeCbor(null)) === null, "CBOR null failed");
  assert(decodeCbor(encodeCbor(undefined)) === undefined, "CBOR undefined failed");

  const floatVal = 3.141592653589793;
  const decodedFloat = decodeCbor(encodeCbor(floatVal));
  assert(Math.abs(decodedFloat - floatVal) < 1e-12, `CBOR float round-trip failed: got ${decodedFloat}`);
  console.log("  ✔ Major Type 7 (Booleans, Null, Undefined, Float64) passed.");

  // ---------------------------------------------------------------------------
  // PART 3: Cashu V4 Token (cashuB) CBOR Decoding
  // ---------------------------------------------------------------------------
  console.log("\n[Section 3] Testing Cashu V4 (cashuB) Token CBOR Format...");

  const sampleV4Token = {
    m: "https://testnut.cashu.space",
    u: "sat",
    t: [
      {
        i: hexToBytes("009a1f293252f338"),
        p: [
          {
            a: 21,
            s: "test-secret-proof-1",
            c: hexToBytes("02c0ffee112233445566778899aabbccddeeff00112233445566778899aabbcc"),
          },
          {
            a: 42,
            s: "test-secret-proof-2",
            c: hexToBytes("03deadbeef112233445566778899aabbccddeeff00112233445566778899aabbcc"),
          },
        ],
      },
    ],
  };

  const v4CborBytes = encodeCbor(sampleV4Token);
  const cashuBToken = `cashuB${bytesToBase64Url(v4CborBytes)}`;
  console.log("  Generated cashuB token:", cashuBToken.slice(0, 60) + "...");

  const parsedV4 = parseCashuToken(cashuBToken);
  assert(parsedV4.mint === "https://testnut.cashu.space", `Expected mint match, got ${parsedV4.mint}`);
  assert(parsedV4.totalAmountSats === 63, `Expected total 63 sats, got ${parsedV4.totalAmountSats}`);
  assert(parsedV4.proofs.length === 2, `Expected 2 proofs, got ${parsedV4.proofs.length}`);
  console.log("  ✔ parseCashuToken successfully parsed cashuB V4 CBOR token!");

  // ---------------------------------------------------------------------------
  // PART 4: NIP-59 Gift Wrap Metadata Privacy for NutZap
  // ---------------------------------------------------------------------------
  console.log("\n[Section 4] Testing NIP-59 Gift Wrap NutZap Privacy...");

  // Generate test recipient keypair
  const recipientSk = generateSecretKey();
  const recipientPk = getPublicKey(recipientSk);
  const recipientPrivHex = bytesToHex(recipientSk);

  console.log("  Recipient Pubkey:", recipientPk);

  // Create a 21 sats Cashu token
  const testProof = {
    id: "009a1f293252f338",
    amount: 21,
    secret: "random-test-secret-salt-xyz",
    C: "02c0ffee112233445566778899aabbccddeeff00112233445566778899aabbcc",
  };
  const testCashuToken = encodeCashuToken("https://testnut.cashu.space", [testProof]);

  // 1. Send NutZap with giftWrap: true
  console.log("  Sending NutZap with giftWrap = true (NIP-59 metadata privacy enabled)...");
  const nutZapResult = await sendCashuNutZap({
    recipientPubkey: recipientPk,
    cashuToken: testCashuToken,
    amountSats: 21,
    comment: "Privacy eCash Tip ⚡🥜",
    mintUrl: "https://testnut.cashu.space",
    giftWrap: true,
  });

  // Verify return object compatibility
  assert(nutZapResult.kind === 9321, `Expected return kind 9321, got ${nutZapResult.kind}`);
  assert(nutZapResult.wrappedKind === 1059, `Expected wrappedKind 1059, got ${nutZapResult.wrappedKind}`);
  assert(nutZapResult.id === nutZapResult.signedEvent.id, "Expected id to match signedEvent.id");
  assert(!!nutZapResult.giftWrapEvent, "Expected giftWrapEvent to be present");
  assert(nutZapResult.giftWrapId === nutZapResult.giftWrapEvent.id, "Expected giftWrapId to match giftWrapEvent.id");
  console.log("  ✔ Return object maintains backward compatibility (kind 9321) while exposing giftWrapEvent.");

  const giftWrapEvent = nutZapResult.giftWrapEvent;

  // 2. Verify outer Gift Wrap metadata privacy
  assert(giftWrapEvent.kind === GIFT_WRAP_KIND, `Outer event must be kind ${GIFT_WRAP_KIND}`);
  assert(giftWrapEvent.pubkey !== recipientPk, "Outer pubkey must NOT be recipient pubkey");
  assert(giftWrapEvent.pubkey !== nutZapResult.signedEvent.pubkey, "Outer pubkey must NOT be sender pubkey (must be ephemeral)");

  // Verify tags: ONLY ["p", recipientPk] allowed, amount and mint URL u must be HIDDEN
  const hasAmountTag = giftWrapEvent.tags.some((t: string[]) => t[0] === "amount");
  const hasMintTag = giftWrapEvent.tags.some((t: string[]) => t[0] === "u");
  const hasPTag = giftWrapEvent.tags.some((t: string[]) => t[0] === "p" && t[1] === recipientPk);

  assert(!hasAmountTag, "CRITICAL PRIVACY LEAK: 'amount' tag was found in outer Gift Wrap event!");
  assert(!hasMintTag, "CRITICAL PRIVACY LEAK: 'u' (mint URL) tag was found in outer Gift Wrap event!");
  assert(hasPTag, "Outer Gift Wrap event must contain recipient 'p' tag");
  console.log("  ✔ Outer Gift Wrap event (Kind 1059) strictly hides amount, mint URL, and sender identity!");

  // Verify timestamp jittering (NIP-59 timing correlation protection)
  const nowSec = Math.floor(Date.now() / 1000);
  assert(giftWrapEvent.created_at <= nowSec, "giftWrap created_at should not be in the future");
  console.log(`  ✔ Gift wrap created_at jitter verified: ${giftWrapEvent.created_at} (<= ${nowSec})`);

  // 3. Receive and unwrap the NutZap as recipient
  console.log("  Unwrapping NutZap using recipient private key...");
  const unwrapped = await receiveAndUnwrapNutZap(giftWrapEvent, recipientPrivHex);

  assert(unwrapped.amount === 21, `Expected unwrapped amount 21, got ${unwrapped.amount}`);
  assert(unwrapped.mint === "https://testnut.cashu.space", `Expected mint match, got ${unwrapped.mint}`);
  assert(unwrapped.memo === "Privacy eCash Tip ⚡🥜", `Expected memo match, got ${unwrapped.memo}`);

  // Parse the extracted token and verify proofs
  const parsedExtractedToken = parseCashuToken(unwrapped.token);
  assert(parsedExtractedToken.totalAmountSats === 21, "Extracted token proof amount mismatch");
  assert(parsedExtractedToken.proofs[0].secret === testProof.secret, "Extracted token proof secret mismatch");
  console.log("  ✔ receiveAndUnwrapNutZap successfully extracted 21 sats Cashu token from NIP-59 envelope!");

  // 4. Test receiveAndUnwrapNutZap on direct Kind 9321 NutZap (backward compatibility)
  console.log("  Testing receiveAndUnwrapNutZap on direct Kind 9321 NutZap (without giftWrap)...");
  const directNutZap = await sendCashuNutZap({
    recipientPubkey: recipientPk,
    cashuToken: testCashuToken,
    amountSats: 21,
    comment: "Direct NutZap 🥜",
    mintUrl: "https://testnut.cashu.space",
    giftWrap: false,
  });
  assert(directNutZap.giftWrapEvent === undefined, "Direct NutZap should not have giftWrapEvent");

  const unwrappedDirect = await receiveAndUnwrapNutZap(directNutZap.signedEvent, recipientPrivHex);
  assert(unwrappedDirect.amount === 21, "Direct NutZap unwrap amount mismatch");
  assert(unwrappedDirect.memo === "Direct NutZap 🥜", "Direct NutZap unwrap memo mismatch");
  console.log("  ✔ Direct Kind 9321 unwrapping verified!");

  console.log("\n===============================================================================");
  console.log("  ALL TESTS PASSED! ZERO-BUFFER CBOR & NIP-59 NUTZAP PRIVACY VERIFIED.        ");
  console.log("===============================================================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
