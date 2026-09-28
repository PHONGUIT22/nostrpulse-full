// src/agent/tools/search.ts
/**
 * Zero-API-Key Web Search Tool using DuckDuckGo HTML Scraper
 */

import * as cheerio from "cheerio";
import type { SearchResult } from "../types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Decode DuckDuckGo redirect link to extract destination URL
 */
function extractActualUrl(rawHref: string): string {
  if (!rawHref) return "";

  try {
    const fullUrl = rawHref.startsWith("http")
      ? rawHref
      : `https://duckduckgo.com${rawHref.startsWith("/") ? "" : "/"}${rawHref}`;

    const parsed = new URL(fullUrl);
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) {
      return decodeURIComponent(uddg);
    }
    return fullUrl;
  } catch {
    return rawHref;
  }
}

/**
 * Perform a live search via DuckDuckGo HTML interface
 */
export async function searchWeb(
  query: string,
  limit = 5
): Promise<SearchResult[]> {
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) return [];

  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
        Referer: "https://html.duckduckgo.com/",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`DuckDuckGo responded with HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // DuckDuckGo HTML layout elements: .result, .result__body, .result__title
    $(".result").each((_, element) => {
      if (results.length >= limit) return false;

      const el = $(element);

      // Skip sponsored/ad links
      if (el.hasClass("result--ad")) return;

      const titleAnchor = el.find(".result__title a.result__url, .result__title a").first();
      const title = titleAnchor.text().trim();
      const rawHref = titleAnchor.attr("href") || "";

      const snippet = el
        .find(".result__snippet")
        .text()
        .replace(/\s+/g, " ")
        .trim();

      const url = extractActualUrl(rawHref);

      if (url && url.startsWith("http") && title) {
        results.push({
          title,
          url,
          snippet: snippet || title,
        });
      }
    });

    // Fallback: If HTML scraper was throttled or returned 0 results, query DuckDuckGo Instant Answer API
    if (results.length === 0) {
      try {
        const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1`;
        const apiRes = await fetch(apiUrl, { headers: { "User-Agent": USER_AGENT } });
        if (apiRes.ok) {
          const data: any = await apiRes.json();
          if (data.AbstractURL && (data.Heading || data.AbstractText)) {
            results.push({
              title: data.Heading || cleanQuery,
              url: data.AbstractURL,
              snippet: data.AbstractText || data.Heading,
            });
          }
          if (Array.isArray(data.RelatedTopics)) {
            for (const topic of data.RelatedTopics) {
              if (results.length >= limit) break;
              if (topic.FirstURL && topic.Text) {
                results.push({
                  title: topic.Text.split("-")[0]?.trim() || topic.Text.slice(0, 50),
                  url: topic.FirstURL,
                  snippet: topic.Text,
                });
              }
            }
          }
        }
      } catch {}
    }

    return results;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      throw new Error("DuckDuckGo search timed out after 10s.");
    }
    throw new Error(`Search failed: ${err?.message || String(err)}`);
  }
}
