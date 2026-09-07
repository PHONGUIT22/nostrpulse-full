// src/components/layout/ClientErrorListener.tsx
"use client";

import { useEffect } from "react";

/**
 * ClientErrorListener intercepts and silences benign WebSocket connection failures
 * and timeouts from decentralized Nostr relays, preventing Next.js Turbopack dev logger
 * from spamming unhandledRejection errors in the terminal.
 */
export default function ClientErrorListener() {
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === "string"
          ? reason
          : reason?.message || reason?.description || String(reason || "");

      const isBenignRelayError =
        message.includes("connection failure") ||
        message.includes("connection timed out") ||
        message.includes("failed to connect to relay") ||
        message.includes("WebSocket connection") ||
        message.includes("relay.") ||
        message.includes("nos.lol");

      if (isBenignRelayError) {
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
