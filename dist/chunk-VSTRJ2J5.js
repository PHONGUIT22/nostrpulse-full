#!/usr/bin/env node
import {
  payWithNWC
} from "./chunk-ZQA6N3HW.js";
import {
  recordAgentSpending
} from "./chunk-PZTMASYC.js";
import {
  getAgentWalletBalance,
  withdrawOrSplitProofsForPayment
} from "./chunk-B7K4NR5L.js";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  decodeCbor,
  encodeCashuToken,
  encodeCbor
} from "./chunk-3W47Q4T4.js";
import {
  decodeBolt11AmountSats
} from "./chunk-PTQMZ56T.js";
import {
  isSafeExternalUrl
} from "./chunk-O2IL2KZT.js";
import {
  assertSpendingAllowed
} from "./chunk-2V7NATOD.js";
import {
  logTelemetryEvent
} from "./chunk-QSUV5YTZ.js";

// src/lib/http402.ts
function extractAuthParam(segment, key) {
  const quotedRegex = new RegExp(`(?:^|[\\s,])${key}\\s*=\\s*"([^"]*)"`, "i");
  const quotedMatch = segment.match(quotedRegex);
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }
  const singleQuotedRegex = new RegExp(`(?:^|[\\s,])${key}\\s*=\\s*'([^']*)'`, "i");
  const singleQuotedMatch = segment.match(singleQuotedRegex);
  if (singleQuotedMatch?.[1]) {
    return singleQuotedMatch[1].trim();
  }
  const unquotedRegex = new RegExp(`(?:^|[\\s,])${key}\\s*=\\s*([^\\s,]+)`, "i");
  const unquotedMatch = segment.match(unquotedRegex);
  if (unquotedMatch?.[1]) {
    return unquotedMatch[1].trim();
  }
  return null;
}
function parseL402Challenge(wwwAuthHeader) {
  if (!wwwAuthHeader || typeof wwwAuthHeader !== "string") {
    return null;
  }
  const schemeMatch = wwwAuthHeader.match(/(?:^|,\s*)(L402|LSAT)\s+(.+)$/i);
  if (!schemeMatch) {
    return null;
  }
  const rawScheme = schemeMatch[1].toUpperCase();
  const scheme = rawScheme === "LSAT" ? "LSAT" : "L402";
  const paramsPart = schemeMatch[2];
  const macaroon = extractAuthParam(paramsPart, "macaroon");
  const invoice = extractAuthParam(paramsPart, "invoice") || extractAuthParam(paramsPart, "token");
  if (!macaroon || !invoice) {
    return null;
  }
  return {
    scheme,
    macaroon,
    invoice,
    amountSats: decodeBolt11AmountSats(invoice)
  };
}
function encodeCashu402Request(req) {
  if (!Number.isFinite(req.amountSats) || req.amountSats <= 0) {
    throw new Error(`Invalid NUT-24 request amountSats: ${req.amountSats}`);
  }
  const payload = {
    a: Math.round(req.amountSats),
    u: req.unit && req.unit.trim() ? req.unit.trim() : "sat"
  };
  if (req.id && req.id.trim()) {
    payload.i = req.id.trim();
  }
  if (Array.isArray(req.mints) && req.mints.length > 0) {
    const normalizedMints = req.mints.map((m) => m.trim().replace(/\/+$/, "")).filter(Boolean);
    if (normalizedMints.length > 0) {
      payload.m = normalizedMints;
    }
  }
  if (req.description && req.description.trim()) {
    payload.d = req.description.trim();
  }
  const cborBytes = encodeCbor(payload);
  return `creqA${bytesToBase64Url(cborBytes)}`;
}
function parseCashu402Challenge(xCashuHeader) {
  if (!xCashuHeader || typeof xCashuHeader !== "string") {
    return null;
  }
  const trimmed = xCashuHeader.trim();
  if (!trimmed.startsWith("creqA") || trimmed.length <= 5) {
    return null;
  }
  try {
    const encodedPayload = trimmed.slice(5);
    const rawBytes = base64UrlToBytes(encodedPayload);
    if (!rawBytes || rawBytes.length === 0) {
      return null;
    }
    const decoded = decodeCbor(rawBytes);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      return null;
    }
    const amountVal = typeof decoded.a === "number" && Number.isFinite(decoded.a) ? decoded.a : 0;
    const unitVal = typeof decoded.u === "string" && decoded.u.trim() ? decoded.u.trim() : "sat";
    const mintsVal = Array.isArray(decoded.m) ? decoded.m.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().replace(/\/+$/, "")) : [];
    const paymentIdVal = typeof decoded.i === "string" && decoded.i.trim() ? decoded.i.trim() : void 0;
    const descriptionVal = typeof decoded.d === "string" && decoded.d.trim() ? decoded.d.trim() : void 0;
    if (amountVal <= 0 && mintsVal.length === 0 && !paymentIdVal && !descriptionVal) {
      return null;
    }
    return {
      paymentId: paymentIdVal,
      amountSats: amountVal,
      unit: unitVal,
      mints: mintsVal,
      description: descriptionVal,
      raw: trimmed
    };
  } catch {
    return null;
  }
}
function headersToRecord(headers) {
  const result = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
function tryParseJson(bodyText) {
  const trimmed = bodyText.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return void 0;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return void 0;
  }
}
function isValidHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
async function selectPreferredVaultMint(acceptedMints, amountSats) {
  if (!acceptedMints || acceptedMints.length === 0) {
    return void 0;
  }
  const walletBalance = await getAgentWalletBalance();
  const normalizedAccepted = new Set(
    acceptedMints.map((m) => m.trim().replace(/\/+$/, "").toLowerCase())
  );
  const fundedMatch = walletBalance.mints.find(
    (m) => normalizedAccepted.has(m.mintUrl.trim().replace(/\/+$/, "").toLowerCase()) && m.balanceSats >= amountSats
  );
  return fundedMatch?.mintUrl ?? acceptedMints[0];
}
async function fetchWith402Payment(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15e3;
  const method = (options.method || "GET").toUpperCase();
  const baseHeaders = { ...options.headers || {} };
  if (!isValidHttpUrl(url) || !options.allowLocalhost && !isSafeExternalUrl(url)) {
    return {
      ok: false,
      status: 0,
      headers: {},
      bodyText: "",
      paymentStatus: "blocked_ssrf",
      error: `URL blocked by SSRF Guard: "${url}" is not an allowed external HTTP(S) target.`
    };
  }
  const requestInit = {
    method,
    headers: baseHeaders,
    body: options.body,
    signal: AbortSignal.timeout(timeoutMs)
  };
  let initialResponse;
  try {
    initialResponse = await fetch(url, requestInit);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      headers: {},
      bodyText: "",
      paymentStatus: "failed",
      error: `HTTP request failed: ${err?.message || String(err)}`
    };
  }
  if (initialResponse.status !== 402) {
    const bodyText = await initialResponse.text();
    return {
      ok: initialResponse.ok,
      status: initialResponse.status,
      headers: headersToRecord(initialResponse.headers),
      bodyText,
      json: tryParseJson(bodyText),
      paymentStatus: "none"
    };
  }
  const initialHeaders = headersToRecord(initialResponse.headers);
  const initialBodyText = await initialResponse.text();
  const xCashuHeader = initialResponse.headers.get("x-cashu");
  const wwwAuthHeader = initialResponse.headers.get("www-authenticate");
  const cashuChallenge = xCashuHeader ? parseCashu402Challenge(xCashuHeader) : null;
  const l402Challenge = wwwAuthHeader ? parseL402Challenge(wwwAuthHeader) : null;
  let selectedRail = null;
  if (options.preferRail === "l402") {
    selectedRail = l402Challenge ? "l402" : cashuChallenge ? "cashu_402" : null;
  } else {
    selectedRail = cashuChallenge ? "cashu_402" : l402Challenge ? "l402" : null;
  }
  if (!selectedRail) {
    return {
      ok: false,
      status: 402,
      headers: initialHeaders,
      bodyText: initialBodyText,
      json: tryParseJson(initialBodyText),
      paymentStatus: "failed",
      error: "Received HTTP 402 without a valid NUT-24 X-Cashu or L402 WWW-Authenticate challenge."
    };
  }
  const amountSats = selectedRail === "cashu_402" ? cashuChallenge.amountSats : l402Challenge.amountSats ?? 0;
  if (!Number.isFinite(amountSats) || amountSats <= 0) {
    return {
      ok: false,
      status: 402,
      headers: initialHeaders,
      bodyText: initialBodyText,
      json: tryParseJson(initialBodyText),
      paymentStatus: "failed",
      rail: selectedRail,
      error: `Unable to determine positive satoshi amount from ${selectedRail} challenge.`
    };
  }
  if (typeof options.maxAutoPaySats === "number" && amountSats > options.maxAutoPaySats) {
    const reason = `HTTP 402 requested ${amountSats.toLocaleString()} sats, exceeding maxAutoPaySats (${options.maxAutoPaySats.toLocaleString()} sats).`;
    await logTelemetryEvent({
      eventType: "payment.guardrail_blocked",
      category: "payment",
      status: "blocked",
      amountSats,
      error: reason,
      metadata: { url, rail: selectedRail, maxAutoPaySats: options.maxAutoPaySats }
    }).catch(() => {
    });
    return {
      ok: false,
      status: 402,
      headers: initialHeaders,
      bodyText: initialBodyText,
      json: tryParseJson(initialBodyText),
      paymentStatus: "blocked_by_guardrails",
      rail: selectedRail,
      error: reason
    };
  }
  const guardrailCheck = await assertSpendingAllowed({
    amountSats,
    rail: selectedRail
  });
  if (!guardrailCheck.allowed) {
    await logTelemetryEvent({
      eventType: "payment.guardrail_blocked",
      category: "payment",
      status: "blocked",
      amountSats,
      error: guardrailCheck.reason,
      metadata: { url, rail: selectedRail }
    }).catch(() => {
    });
    return {
      ok: false,
      status: 402,
      headers: initialHeaders,
      bodyText: initialBodyText,
      json: tryParseJson(initialBodyText),
      paymentStatus: "blocked_by_guardrails",
      rail: selectedRail,
      error: guardrailCheck.reason
    };
  }
  let paidMintUrl;
  let paidPreimage;
  try {
    const retryHeaders = { ...baseHeaders };
    if (selectedRail === "cashu_402") {
      const preferredMint = await selectPreferredVaultMint(
        cashuChallenge.mints,
        amountSats
      );
      const { sendProofs, mintUrl } = await withdrawOrSplitProofsForPayment(
        amountSats,
        preferredMint
      );
      paidMintUrl = mintUrl;
      const cashuToken = encodeCashuToken(
        mintUrl,
        sendProofs,
        cashuChallenge.unit || "sat"
      );
      retryHeaders["X-Cashu"] = cashuToken;
    } else {
      if (options.customInvoicePayer) {
        const customRes = await options.customInvoicePayer(
          l402Challenge.invoice,
          amountSats
        );
        paidPreimage = customRes?.preimage;
      } else {
        const nwcRes = await payWithNWC({
          invoice: l402Challenge.invoice,
          nwcUri: options.nwcUri,
          timeoutMs
        });
        if (nwcRes.status !== "success") {
          throw new Error(nwcRes.error || "NIP-47 NWC payment failed for L402 invoice.");
        }
        paidPreimage = nwcRes.preimage;
      }
      if (!paidPreimage) {
        throw new Error("No Lightning payment preimage received for L402 settlement.");
      }
      retryHeaders["Authorization"] = `L402 ${l402Challenge.macaroon}:${paidPreimage}`;
    }
    const retryResponse = await fetch(url, {
      method,
      headers: retryHeaders,
      body: options.body,
      signal: AbortSignal.timeout(timeoutMs)
    });
    const retryBodyText = await retryResponse.text();
    const retryHeadersRecord = headersToRecord(retryResponse.headers);
    await Promise.allSettled([
      recordAgentSpending({
        amountSats,
        rail: selectedRail === "cashu_402" ? "cashu" : "lightning_nwc",
        eventId: paidPreimage,
        memo: `HTTP 402 (${selectedRail}) -> ${url}`
      }),
      logTelemetryEvent({
        eventType: selectedRail === "cashu_402" ? "payment.cashu_402.settled" : "payment.l402.settled",
        category: "payment",
        status: retryResponse.ok ? "success" : "failed",
        amountSats,
        metadata: {
          url,
          httpStatus: retryResponse.status,
          rail: selectedRail,
          mintUrl: paidMintUrl,
          preimage: paidPreimage
        }
      })
    ]);
    return {
      ok: retryResponse.ok,
      status: retryResponse.status,
      headers: retryHeadersRecord,
      bodyText: retryBodyText,
      json: tryParseJson(retryBodyText),
      paymentStatus: retryResponse.ok ? "paid" : "failed",
      rail: selectedRail,
      amountPaidSats: amountSats,
      mintUrl: paidMintUrl,
      preimage: paidPreimage,
      ...retryResponse.ok ? {} : {
        error: `HTTP 402 payment sent via ${selectedRail}, but server returned HTTP ${retryResponse.status}.`
      }
    };
  } catch (err) {
    const errorMsg = err?.message || String(err);
    await logTelemetryEvent({
      eventType: selectedRail === "cashu_402" ? "payment.cashu_402.failed" : "payment.l402.failed",
      category: "payment",
      status: "failed",
      amountSats,
      error: errorMsg,
      metadata: {
        url,
        rail: selectedRail,
        mintUrl: paidMintUrl
      }
    }).catch(() => {
    });
    return {
      ok: false,
      status: 402,
      headers: initialHeaders,
      bodyText: initialBodyText,
      json: tryParseJson(initialBodyText),
      paymentStatus: "failed",
      rail: selectedRail,
      error: errorMsg
    };
  }
}

export {
  parseL402Challenge,
  encodeCashu402Request,
  parseCashu402Challenge,
  fetchWith402Payment
};
