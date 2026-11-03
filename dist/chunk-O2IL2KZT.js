#!/usr/bin/env node

// src/lib/ssrf.ts
function isPrivateOrLocalHost(host) {
  if (!host || typeof host !== "string") return true;
  const cleanHost = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (cleanHost === "localhost" || cleanHost.endsWith(".localhost") || cleanHost === "local" || cleanHost.endsWith(".local") || cleanHost === "internal" || cleanHost.endsWith(".internal") || cleanHost.endsWith(".lan") || cleanHost.endsWith(".home.arpa")) {
    return true;
  }
  if (cleanHost.includes(":")) {
    if (cleanHost === "::1" || cleanHost === "::" || cleanHost.startsWith("fe80:") || // Link-local unicast (fe80::/10)
    cleanHost.startsWith("fc") || // Unique local address (fc00::/7)
    cleanHost.startsWith("fd") || cleanHost.startsWith("::ffff:")) {
      return true;
    }
  }
  if (!cleanHost.includes(".")) {
    return true;
  }
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = cleanHost.match(ipv4Regex);
  if (match) {
    const a = parseInt(match[1], 10);
    const b = parseInt(match[2], 10);
    const c = parseInt(match[3], 10);
    const d = parseInt(match[4], 10);
    if (a > 255 || b > 255 || c > 255 || d > 255) {
      return true;
    }
    if (a === 0) return true;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}
function isSafeExternalUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    let candidate = urlStr.trim();
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate);
    if (!hasScheme) {
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
        return false;
      }
      candidate = `https://${candidate}`;
    }
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (process.env.ALLOW_LOCAL_MINTS === "true") {
      return true;
    }
    if (isPrivateOrLocalHost(parsed.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// src/lib/nip05.ts
async function verifyNip05(nip05, pubkey) {
  if (!nip05 || !nip05.includes("@") || !pubkey) {
    return {
      isVerified: false,
      nip05: nip05 || "",
      error: "No NIP-05 identifier found"
    };
  }
  const clean = nip05.trim().toLowerCase();
  const parts = clean.split("@");
  if (parts.length !== 2) {
    return { isVerified: false, nip05: clean, error: "Invalid format" };
  }
  const [name, domain] = parts;
  if (!isSafeExternalUrl(`https://${domain}`)) {
    return {
      isVerified: false,
      nip05: clean,
      domain,
      name,
      error: "Blocked private or unsafe domain"
    };
  }
  try {
    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
      // 2.5s timeout to avoid hanging
      next: { revalidate: 3600 }
    });
    if (!res.ok) {
      return {
        isVerified: false,
        nip05: clean,
        domain,
        name,
        error: `DNS host returned HTTP ${res.status}`
      };
    }
    const data = await res.json();
    const matchedPubkey = data?.names?.[name]?.toLowerCase();
    if (matchedPubkey && matchedPubkey === pubkey.toLowerCase()) {
      return {
        isVerified: true,
        nip05: clean,
        domain,
        name
      };
    }
    return {
      isVerified: false,
      nip05: clean,
      domain,
      name,
      error: "Public key mismatch in DNS nostr.json (Potential Impersonator)"
    };
  } catch (err) {
    return {
      isVerified: false,
      nip05: clean,
      domain,
      name,
      error: err.message || "DNS verification timed out"
    };
  }
}

export {
  isSafeExternalUrl,
  verifyNip05
};
