// src/agent/tools/scrape.ts
/**
 * Fast HTML-to-Markdown Web Scraper with Adaptive Content Truncation
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type { ScrapeResult } from "../types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Remove script, style, navigation, and boilerplate elements
turndown.remove([
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "footer",
  "header",
  "aside",
  "form",
]);

/**
 * Truncate markdown content to a maximum number of words without cutting words in half
 */
function truncateToMaxWords(text: string, maxWords: number): { text: string; count: number } {
  const words = text.trim().split(/\s+/);
  const total = words.length;

  if (total <= maxWords) {
    return { text: text.trim(), count: total };
  }

  const truncated = words.slice(0, maxWords).join(" ");
  return {
    text: `${truncated}\n\n... [Content truncated due to model context limits: showing ${maxWords}/${total} words]`,
    count: maxWords,
  };
}

/**
 * Scrape a web page and return cleaned, readable Markdown content
 */
export async function scrapePage(
  url: string,
  maxWords = 1000
): Promise<ScrapeResult> {
  const cleanUrl = (url || "").trim();
  if (!cleanUrl || !cleanUrl.startsWith("http")) {
    throw new Error(`Invalid URL provided for scraping: '${url}'`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(cleanUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${cleanUrl}: HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain") &&
      !contentType.includes("application/xhtml")
    ) {
      // If it's pure text or json
      const rawText = await response.text();
      const { text, count } = truncateToMaxWords(rawText, maxWords);
      return {
        url: cleanUrl,
        content: text,
        wordCount: count,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title
    const title =
      $('meta[property="og:title"]').attr("content") ||
      $("title").text().trim() ||
      $("h1").first().text().trim();

    // Strip unneeded DOM nodes
    $(
      "script, style, noscript, nav, footer, header, aside, form, svg, iframe, " +
        ".ads, .advertisement, .sidebar, .menu, .cookie-banner, .popup, " +
        '[role="navigation"], [role="banner"], [aria-hidden="true"]'
    ).remove();

    // Target main article container if available
    const mainContentEl = $("article, main, #content, .content, .post-content, .entry-content, body").first();
    const rawHtmlContent = mainContentEl.html() || $("body").html() || html;

    // Convert to Markdown
    let markdown = turndown.turndown(rawHtmlContent);

    // Clean up excessive blank lines and spaces
    markdown = markdown
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    const { text, count } = truncateToMaxWords(markdown, maxWords);

    return {
      url: cleanUrl,
      title: title || undefined,
      content: text,
      wordCount: count,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      throw new Error(`Scraping timed out for ${cleanUrl} after 12s.`);
    }
    throw new Error(`Scraping error on ${cleanUrl}: ${err?.message || String(err)}`);
  }
}
