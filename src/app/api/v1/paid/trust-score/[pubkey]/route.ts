// src/app/api/v1/paid/trust-score/[pubkey]/route.ts
import { NextResponse } from "next/server";
import { normalizePubkey, encodeNpub, getWebOfTrustDistance } from "@/lib/wot";
import { getCreatorFromDb, getZapTotalsFromDb } from "@/lib/db";
import { calculateTrustScore } from "@/lib/trust-score";
import { DEFAULT_CASHU_MINT } from "@/lib/cashu";
import { withHttp402Paywall } from "@/lib/http402-server";

interface RouteContext {
  params: Promise<{ pubkey: string }>;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cashu",
  "Access-Control-Expose-Headers": "X-Cashu, WWW-Authenticate, X-NostrPulse-Receipt",
  "Cache-Control": "no-store",
};

/**
 * Handle CORS preflight OPTIONS request for HTTP 402 clients.
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * GET /api/v1/paid/trust-score/[pubkey]
 *
 * Paid Bitcoin-native HTTP 402 endpoint returning deep Anti-Sybil Web-of-Trust
 * and Economic Stake analytics for autonomous AI agents (5 sats per query).
 */
export const GET = withHttp402Paywall<RouteContext>(
  async (_request, context, receipt) => {
    try {
      const { pubkey: rawParam } = await context.params;

      if (!rawParam) {
        return NextResponse.json(
          { error: "Public key or npub is required" },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const hexPubkey = normalizePubkey(rawParam);
      if (!hexPubkey) {
        return NextResponse.json(
          { error: "Invalid Nostr public key or npub format" },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const npub = encodeNpub(hexPubkey);
      const wotResult = getWebOfTrustDistance(hexPubkey);

      const [creatorDb, zapRow] = await Promise.all([
        getCreatorFromDb(hexPubkey),
        getZapTotalsFromDb(hexPubkey),
      ]);

      const verifiedZapsSats = zapRow?.valid_sender_sats ?? 0;
      const totalZapsSats = zapRow?.total_sats ?? 0;
      const sybilFilteredSats = Math.max(0, totalZapsSats - verifiedZapsSats);

      let score = creatorDb ? creatorDb.score : 0;
      let tier: "Verified Builder" | "Active Contributor" | "Unverified / Potential Bot" =
        "Unverified / Potential Bot";

      if (creatorDb) {
        score = creatorDb.score;
        if (wotResult.distance === 0 || (score >= 80 && wotResult.distance <= 1)) {
          tier = "Verified Builder";
        } else if (score >= 50 && wotResult.distance <= 2) {
          tier = "Active Contributor";
        } else {
          tier = "Unverified / Potential Bot";
        }
      } else {
        const calculated = calculateTrustScore(
          { pubkey: hexPubkey, npub, name: "", created_at: undefined },
          undefined,
          wotResult
        );
        score = calculated.score;
        tier = calculated.tier;
      }

      return NextResponse.json(
        {
          pubkey: hexPubkey,
          npub,
          score: Math.round(score),
          tier,
          wot: {
            direct_anchor_endorsed:
              wotResult.distance === 0 ||
              (wotResult.distance === 1 && wotResult.endorsedByCount > 0),
            distance: wotResult.distance,
            endorsers_count: wotResult.endorsedByCount,
          },
          economic_stake: {
            verified_zaps_sats: verifiedZapsSats,
            sybil_filtered_sats: sybilFilteredSats,
            total_zaps_sats: totalZapsSats,
          },
          payment_receipt: {
            rail: receipt.rail,
            amountSats: receipt.amountSats,
            paidAt: receipt.paidAt,
          },
        },
        { status: 200, headers: CORS_HEADERS }
      );
    } catch (error: any) {
      console.error("[PaidTrustScoreAPI] Error processing request:", error);
      return NextResponse.json(
        { error: "Internal server error while resolving paid trust report" },
        { status: 500, headers: CORS_HEADERS }
      );
    }
  },
  {
    amountSats: 5,
    acceptedMints: [DEFAULT_CASHU_MINT],
    description: "NostrPulse Deep Anti-Sybil Trust Report (5 sats)",
    enableL402: Boolean(process.env.NWC_URI),
    nwcUri: process.env.NWC_URI,
  }
);
