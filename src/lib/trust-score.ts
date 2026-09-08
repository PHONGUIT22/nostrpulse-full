// src/lib/trust-score.ts
import { NostrProfile, fetchNostrProfile, DEFAULT_RELAYS } from "@/lib/nostr";
import { Nip05Result } from "@/lib/nip05";

import { 
  getWebOfTrustDistance, 
  resolveWebOfTrustDistance, 
  WebOfTrustDistanceResult 
} from "@/lib/wot";

import {
  fetchEconomicStake,
  EconomicStakeResult,
} from "@/lib/economic-stake";

export { fetchNostrProfile, DEFAULT_RELAYS };
export type { NostrProfile, WebOfTrustDistanceResult, EconomicStakeResult };

export interface TrustScoreBreakdownItem {
  label: string;
  category: "NIP-05 Identity" | "Web-of-Trust (WoT)" | "Lightning V4V" | "Network Longevity" | "Profile Quality";
  points: number;
  maxPoints: number;
  passed: boolean;
  description: string;
  sybilRiskLevel?: "Low" | "Moderate" | "High";
}

export interface TrustScoreResult {
  score: number;
  tier: "Verified Builder" | "Active Contributor" | "Unverified / Potential Bot";
  tierColor: string;
  tierBg: string;
  tierBorder: string;
  summary: string;
  nip05Status: Nip05Result;
  wotScore: number;
  wotDistance: 0 | 1 | 2 | 3;
  wotDetails?: WebOfTrustDistanceResult;
  economicStake?: EconomicStakeResult;
  sybilResistanceLevel: "High" | "Medium" | "Low" | "Vulnerable";
  breakdown: TrustScoreBreakdownItem[];
}

export function calculateTrustScore(
  profile: NostrProfile | null,
  nip05Result?: Nip05Result,
  wotResult?: WebOfTrustDistanceResult,
  economicStakeResult?: EconomicStakeResult
): TrustScoreResult {
  // 1. Resolve NIP-05 identifier
  const resolvedNip05: Nip05Result = nip05Result || {
    isVerified: Boolean(profile?.nip05 && profile.nip05.includes("@")),
    nip05: profile?.nip05 || "",
    domain: profile?.nip05?.split("@")[1] || "",
  };

  if (!profile) {
    return {
      score: 5,
      tier: "Unverified / Potential Bot",
      tierColor: "text-rose-400",
      tierBg: "bg-rose-950/40",
      tierBorder: "border-rose-800/80",
      summary: "Profile data is unavailable or could not be queried from open relays.",
      nip05Status: resolvedNip05,
      wotScore: 0,
      wotDistance: 3,
      sybilResistanceLevel: "Vulnerable",
      breakdown: [],
    };
  }

  let rawScore = 0;
  const breakdown: TrustScoreBreakdownItem[] = [];

  // =========================================================================
  // Pillar 1: NIP-05 Cryptographic DNS Verification (Max: 25 pts)
  // =========================================================================
  const isNip05Verified = resolvedNip05.isVerified;
  let nip05Points = 0;

  if (isNip05Verified) {
    // Bonus points for custom domain instead of free public gateways
    const isCustomDomain = resolvedNip05.domain && !["nostrcheck.me", "nostrplebs.com", "iris.to"].includes(resolvedNip05.domain);
    nip05Points = isCustomDomain ? 25 : 22;
  }

  rawScore += nip05Points;
  breakdown.push({
    label: "NIP-05 Cryptographic DNS Identity",
    category: "NIP-05 Identity",
    points: nip05Points,
    maxPoints: 25,
    passed: isNip05Verified,
    sybilRiskLevel: isNip05Verified ? "Low" : "High",
    description: isNip05Verified
      ? `Cryptographically signed by https://${resolvedNip05.domain}/.well-known/nostr.json`
      : profile.nip05
      ? `Verification Failed: ${resolvedNip05.error || "Pubkey mismatch with DNS record"}`
      : "No NIP-05 identifier configured (High vulnerability to impersonation)",
  });

  // =========================================================================
  // Pillar 2: Web-of-Trust (WoT) Social Distance (Max: 25 pts)
  // =========================================================================
  const resolvedWot: WebOfTrustDistanceResult =
    wotResult || getWebOfTrustDistance(profile.pubkey || "");

  const wotPoints = resolvedWot.wotPoints;
  rawScore += wotPoints;

  let wotDescription = "";
  if (resolvedWot.distance === 0) {
    wotDescription = "Hop 0: Core Root Anchor";
  } else if (resolvedWot.distance === 1) {
    const endorsers = resolvedWot.endorsers || [];
    const sample = endorsers.slice(0, 3).join(", ");
    const extra = endorsers.length > 3 ? ` +${endorsers.length - 3} more` : "";
    wotDescription = `Hop 1: Endorsed by ${resolvedWot.endorsedByCount} Anchors${sample ? ` (${sample}${extra})` : ""}`;
  } else if (resolvedWot.distance === 2) {
    wotDescription = `Hop 2: Transitive Trust via ${resolvedWot.endorsedByCount} Ring-1 node${resolvedWot.endorsedByCount > 1 ? "s" : ""}`;
  } else {
    wotDescription = "Hop > 2: Isolated keypair outside trust graph";
  }

  breakdown.push({
    label: "Web-of-Trust (WoT) Social Distance",
    category: "Web-of-Trust (WoT)",
    points: wotPoints,
    maxPoints: 25,
    passed: wotPoints >= 10,
    sybilRiskLevel: resolvedWot.sybilRisk,
    description: wotDescription,
  });

  // =========================================================================
  // Pillar 3: Lightning Value-4-Value & Economic Stake (Max: 20 pts)
  // =========================================================================
  const hasLud16 = Boolean(profile.lud16 && profile.lud16.includes("@"));
  let lud16Points = 0;
  let lud16Desc = "";

  if (economicStakeResult) {
    // 10 pts for valid payment endpoint + up to 10 pts for verified WoT Economic Stake
    const endpointBase = hasLud16 ? 10 : 0;
    const stakePoints = economicStakeResult.economicPoints; // min(10, round(log10(sats+1)*K))
    lud16Points = Math.min(20, endpointBase + stakePoints);

    const validSats = economicStakeResult.totalValidSats;
    const validCount = economicStakeResult.validZapsCount;
    const filteredCount = economicStakeResult.filteredSybilZapsCount;
    const filteredSats = economicStakeResult.totalFilteredSats;

    if (hasLud16) {
      lud16Desc = `Active Lightning Address (${profile.lud16})`;
      if (validSats > 0) {
        lud16Desc += ` • ${validSats.toLocaleString()} Sats received from ${validCount} verified WoT sender${validCount > 1 ? "s" : ""} (Economic Stake: +${stakePoints} pts)`;
      } else {
        lud16Desc += " • Awaiting verified WoT incoming zaps";
      }
      if (filteredCount > 0) {
        lud16Desc += ` (${filteredCount} Sybil zap${filteredCount > 1 ? "s" : ""} / ${filteredSats.toLocaleString()} Sats filtered out)`;
      }
    } else {
      lud16Desc = "No Lightning address linked (Cannot send or receive value)";
    }
  } else {
    // Synchronous fallback when live zap receipts are not queried
    lud16Points = hasLud16 ? 20 : 0;
    lud16Desc = hasLud16
      ? `Active Lightning Payment Address (${profile.lud16}) configured for Zaps`
      : "No Lightning address linked (Cannot send or receive value)";
  }

  rawScore += lud16Points;

  breakdown.push({
    label: "Lightning V4V & Economic Stake",
    category: "Lightning V4V",
    points: lud16Points,
    maxPoints: 20,
    passed: lud16Points >= 10,
    sybilRiskLevel: lud16Points >= 10 ? "Low" : "Moderate",
    description: lud16Desc,
  });

  // =========================================================================
  // Pillar 4: Network Longevity & Relay Synchronization (Max: 15 pts)
  // =========================================================================
  const now = Math.floor(Date.now() / 1000);
  const accountAgeSeconds = profile.created_at ? now - profile.created_at : 0;
  const isOlderThan1Year = accountAgeSeconds >= 86400 * 365;
  const isOlderThan6Months = accountAgeSeconds >= 86400 * 180;
  
  let agePoints = 0;
  if (isOlderThan1Year) agePoints = 10;
  else if (isOlderThan6Months) agePoints = 7;
  else if (profile.created_at) agePoints = 3;

  const relayCount = profile.relays_connected || 6;
  const relayPoints = relayCount >= 4 ? 5 : relayCount >= 2 ? 3 : 0;
  const longevityPoints = agePoints + relayPoints;
  rawScore += longevityPoints;

  const ageMonths = Math.max(1, Math.round(accountAgeSeconds / (86400 * 30)));
  breakdown.push({
    label: "Key Longevity & Multi-Relay Propagation",
    category: "Network Longevity",
    points: longevityPoints,
    maxPoints: 15,
    passed: longevityPoints >= 10,
    sybilRiskLevel: isOlderThan6Months ? "Low" : "Moderate",
    description: isOlderThan6Months
      ? `Established keypair (${ageMonths} months active) replicated across ${relayCount} relays`
      : `Newly active keypair observed on ${relayCount} relays`,
  });

  // =========================================================================
  // Pillar 5: Profile Metadata Richness & Consistency (Max: 15 pts)
  // =========================================================================
  let metaPoints = 0;
  if (profile.picture && profile.picture.startsWith("http")) metaPoints += 5;
  if (profile.about && profile.about.trim().length >= 25) metaPoints += 5;
  if (profile.website && profile.website.startsWith("http")) metaPoints += 5;
  rawScore += metaPoints;

  breakdown.push({
    label: "Metadata Completeness & Web Presence",
    category: "Profile Quality",
    points: metaPoints,
    maxPoints: 15,
    passed: metaPoints >= 10,
    sybilRiskLevel: metaPoints >= 10 ? "Low" : "High",
    description: metaPoints >= 10
      ? "Fully populated metadata (Avatar, Bio, and external domain link)"
      : "Incomplete metadata profile (Missing avatar, bio, or external links)",
  });

  // =========================================================================
  // ANTI-SYBIL GATEKEEPER (Strict Social Distance & Damping Constraints)
  // =========================================================================
  let finalScore = rawScore;
  let isGatekeeperCapped = false;
  let gatekeeperReason = "";

  // 1. Distance >= 3 (Hop > 2 / Isolated Keypair): Hard ceiling of 25/100
  if (resolvedWot.distance >= 3) {
    if (finalScore > 25) {
      finalScore = 25;
      isGatekeeperCapped = true;
      gatekeeperReason = "Sybil Gatekeeper: Isolated keypair outside trust graph (Hop > 2). Score hard-capped at 25/100.";
    }
  } 
  // 2. Distance == 2 (Hop 2 / Transitive Trust): Hard ceiling of 50/100
  else if (resolvedWot.distance === 2) {
    if (finalScore > 50) {
      finalScore = 50;
      isGatekeeperCapped = true;
      gatekeeperReason = "Sybil Gatekeeper: Hop 2 transitive trust cannot exceed Active Contributor. Score hard-capped at 50/100.";
    }
  }
  // 3. Distance <= 1 (Hop 0 or Hop 1): Standard damping if lacking both NIP-05 and sufficient WoT connectivity
  else if (!isNip05Verified && wotPoints < 10) {
    if (finalScore >= 45) {
      finalScore = 44;
      isGatekeeperCapped = true;
      gatekeeperReason = "Sybil Risk Alert: Unverified DNS identity with insufficient WoT endorsements. Score capped at 44.";
    }
  }

  // Tier and Sybil Resistance classification
  let tier: TrustScoreResult["tier"] = "Unverified / Potential Bot";
  let tierColor = "text-rose-400";
  let tierBg = "bg-rose-950/40";
  let tierBorder = "border-rose-800/80";
  let sybilResistanceLevel: TrustScoreResult["sybilResistanceLevel"] = "Vulnerable";
  let summary = isGatekeeperCapped
    ? gatekeeperReason
    : "Caution: Unverified identity keys. Exercise caution before conducting high-value Zaps.";

  if (resolvedWot.distance >= 3) {
    // Strictly forced "Unverified / Potential Bot" regardless of metadata or NIP-05
    tier = "Unverified / Potential Bot";
    tierColor = "text-rose-400";
    tierBg = "bg-rose-950/40";
    tierBorder = "border-rose-800/80";
    sybilResistanceLevel = "Vulnerable";
    if (!isGatekeeperCapped) {
      summary = "High Sybil Risk: Isolated keypair outside the Web-of-Trust graph (Hop > 2).";
    }
  } else if (resolvedWot.distance === 2) {
    // Hop 2: Cannot exceed "Active Contributor" (if finalScore >= 50, otherwise Unverified)
    if (finalScore >= 50) {
      tier = "Active Contributor";
      tierColor = "text-amber-400";
      tierBg = "bg-amber-950/40";
      tierBorder = "border-amber-700/80";
      sybilResistanceLevel = "Medium";
      if (!isGatekeeperCapped) {
        summary = "Moderate Sybil Resistance: Transitive trust established via Ring-1 nodes (Hop 2).";
      }
    } else {
      tier = "Unverified / Potential Bot";
      tierColor = "text-rose-400";
      tierBg = "bg-rose-950/40";
      tierBorder = "border-rose-800/80";
      sybilResistanceLevel = "Low";
      if (!isGatekeeperCapped) {
        summary = "Nascent keypair with partial transitive trust (Hop 2). Low composite score.";
      }
    }
  } else {
    // Only accounts with distance <= 1 (Hop 0 or Hop 1) are eligible for "Verified Builder" (>= 80 points)
    if (resolvedWot.distance === 0) {
      tier = "Verified Builder";
      tierColor = "text-emerald-400";
      tierBg = "bg-emerald-950/40";
      tierBorder = "border-emerald-700/80";
      sybilResistanceLevel = "High";
      summary = `Root Seed Anchor: Direct cryptographic pillar in the Nostr Core Web-of-Trust (${resolvedWot.tier || "Core Protocol"}).`;
    } else if (finalScore >= 80) {
      tier = "Verified Builder";
      tierColor = "text-emerald-400";
      tierBg = "bg-emerald-950/40";
      tierBorder = "border-emerald-700/80";
      sybilResistanceLevel = "High";
      summary = "High Sybil Resistance: Cryptographically verified identity with direct Ring-1 Web-of-Trust endorsement.";
    } else if (finalScore >= 50) {
      tier = "Active Contributor";
      tierColor = "text-amber-400";
      tierBg = "bg-amber-950/40";
      tierBorder = "border-amber-700/80";
      sybilResistanceLevel = "Medium";
      summary = "Moderate Sybil Resistance: Direct Ring-1 follower with partial cryptographic verification.";
    } else {
      tier = "Unverified / Potential Bot";
      tierColor = "text-rose-400";
      tierBg = "bg-rose-950/40";
      tierBorder = "border-rose-800/80";
      sybilResistanceLevel = finalScore >= 35 ? "Low" : "Vulnerable";
      if (!isGatekeeperCapped) {
        summary = "Caution: Low composite score despite Ring-1 connection.";
      }
    }
  }

  return {
    score: finalScore,
    tier,
    tierColor,
    tierBg,
    tierBorder,
    summary,
    nip05Status: resolvedNip05,
    wotScore: wotPoints,
    wotDistance: resolvedWot.distance,
    wotDetails: resolvedWot,
    economicStake: economicStakeResult,
    sybilResistanceLevel,
    breakdown,
  };
}

/**
 * Asynchronously calculates the Trust Score with multi-hop graph resolution and Economic Stake zaps.
 * Resolves Hop 0 and Hop 1 via in-memory snapshot, and queries relays in parallel for:
 * - Hop 2 transitive trust
 * - Kind 9735 Zap receipts for Sats-Weighted In-Degree (Economic Stake)
 * (enforcing <= 3000ms timeout via Promise.race).
 *
 * @param profile - Nostr profile
 * @param nip05Result - Optional pre-verified NIP-05 result
 * @param options - Relay query options and kFactor
 */
export async function calculateTrustScoreAsync(
  profile: NostrProfile | null,
  nip05Result?: Nip05Result,
  options?: { relays?: string[]; timeoutMs?: number; kFactor?: number }
): Promise<TrustScoreResult> {
  if (!profile || !profile.pubkey) {
    return calculateTrustScore(profile, nip05Result);
  }

  // Query multi-hop WoT and Economic Stake in parallel with 3s timeout
  const [wotResult, economicStakeResult] = await Promise.all([
    resolveWebOfTrustDistance(profile.pubkey, options),
    fetchEconomicStake(profile.pubkey, options),
  ]);

  return calculateTrustScore(profile, nip05Result, wotResult, economicStakeResult);
}