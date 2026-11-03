/**
 * src/lib/ssrf.ts
 *
 * Server-Side Request Forgery (SSRF) Protection Utility.
 * Guards Cashu Mint probes, NIP-05 DNS verifications, and external fetch calls
 * against probing internal networks, loopbacks, and cloud metadata services.
 */

/**
 * Checks whether a given hostname points to a private network, loopback, or cloud metadata IP.
 *
 * @param host - Hostname or IP string (from URL)
 * @returns true if the host is internal, loopback, private, or metadata; false if public external
 */
export function isPrivateOrLocalHost(host: string): boolean {
  if (!host || typeof host !== "string") return true;

  // Normalize host: lowercase, strip brackets from IPv6, trim whitespace
  const cleanHost = host.trim().toLowerCase().replace(/^\[|\]$/g, "");

  // 1. Common local names & special internal domain suffixes
  if (
    cleanHost === "localhost" ||
    cleanHost.endsWith(".localhost") ||
    cleanHost === "local" ||
    cleanHost.endsWith(".local") ||
    cleanHost === "internal" ||
    cleanHost.endsWith(".internal") ||
    cleanHost.endsWith(".lan") ||
    cleanHost.endsWith(".home.arpa")
  ) {
    return true;
  }

  // 2. IPv6 loopback, unspecified, and private/link-local ranges
  if (cleanHost.includes(":")) {
    if (
      cleanHost === "::1" ||
      cleanHost === "::" ||
      cleanHost.startsWith("fe80:") || // Link-local unicast (fe80::/10)
      cleanHost.startsWith("fc") || // Unique local address (fc00::/7)
      cleanHost.startsWith("fd") ||
      cleanHost.startsWith("::ffff:") // IPv4-mapped IPv6
    ) {
      return true;
    }
  }

  // 3. Single-label hostnames without any dot (e.g., "metadata", "intranet", "router")
  if (!cleanHost.includes(".")) {
    return true;
  }

  // 4. IPv4 address classification
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = cleanHost.match(ipv4Regex);
  if (match) {
    const a = parseInt(match[1], 10);
    const b = parseInt(match[2], 10);
    const c = parseInt(match[3], 10);
    const d = parseInt(match[4], 10);

    // Reject invalid octets
    if (a > 255 || b > 255 || c > 255 || d > 255) {
      return true;
    }

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;

    // 127.0.0.0/8 (Loopback address)
    if (a === 127) return true;

    // 10.0.0.0/8 (Private network)
    if (a === 10) return true;

    // 172.16.0.0/12 (Private network: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16 (Private network)
    if (a === 192 && b === 168) return true;

    // 169.254.0.0/16 (Link-local & AWS/GCP/Azure Cloud Metadata)
    if (a === 169 && b === 254) return true;

    // 100.64.0.0/10 (Carrier-grade NAT: 100.64.0.0 - 100.127.255.255)
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  return false;
}

/**
 * Validates whether a given URL string is a safe external HTTP or HTTPS URL.
 * Automatically blocks non-HTTP/HTTPS protocols, private IPs, loopback, and cloud metadata
 * unless ALLOW_LOCAL_MINTS=true is explicitly set in the environment.
 *
 * @param urlStr - Target URL string
 * @returns true if safe to fetch/connect externally, false otherwise
 */
export function isSafeExternalUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;

  try {
    let candidate = urlStr.trim();

    // Check scheme presence
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate);
    if (!hasScheme) {
      // If it contains another colon-scheme like "file:" or "javascript:"
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
        return false;
      }
      candidate = `https://${candidate}`;
    }

    const parsed = new URL(candidate);

    // Only allow HTTP and HTTPS protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    // Allow local hostnames/IPs only when explicitly enabled for development/testing
    if (process.env.ALLOW_LOCAL_MINTS === "true") {
      return true;
    }

    // Enforce private/internal host blocking
    if (isPrivateOrLocalHost(parsed.hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
