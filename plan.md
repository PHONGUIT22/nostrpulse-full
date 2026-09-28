# Implementation Plan: Universal Local AI Web Browsing Agent (>= 1B Parameters)

> **Objective:** Build an autonomous, adaptive local AI agent architecture supporting any open-weights model from **1B parameters and above** (e.g., Qwen 2.5 1.5B/7B/14B, Llama 3.2 1B/3B, Llama 3.1 8B, DeepSeek R1 Distill) via Ollama/OpenAI-compatible endpoint. The agent can search the live web, scrape and clean articles, and synthesize answers with verified citations without requiring paid APIs.

---

## 🏗️ Universal System Architecture

```
User Query (CLI / Web UI)
           │
           ▼
┌────────────────────────────────────────────────────────┐
│  src/agent/orchestrator.ts (Adaptive Model Controller) │
│  - Configurable: OLLAMA_MODEL (default: qwen2.5-coder:1.5b)
│  - Adaptive Context Window based on Parameter Tier     │
│  - Deterministic Tool-Calling Guardrails (Max 2-5 Steps)
└───────────────┬────────────────────────┬───────────────┘
                │                        │
                ▼                        ▼
     ┌──────────────────────┐  ┌──────────────────────┐
     │  tools/search.ts     │  │  tools/scrape.ts     │
     │  - DuckDuckGo HTML   │  │  - Cheerio + Turndown│
     │  - Zero API Key      │  │  - Adaptive Truncate │
     └──────────────────────┘  └──────────────────────┘
```

---

## ⚙️ Model Parameter Tiers & Adaptive Configs

The engine dynamically adjusts its context size and reasoning depth based on the detected model size:

| Parameter Tier | Target Models | Max Context Scrape | Max Tool Steps | Temperature |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1 (1B – 3B)** | `qwen2.5-coder:1.5b`, `llama3.2:1b`, `llama3.2:3b` | 800 – 1,000 words | 2 – 3 steps (Guarded) | 0.2 (Strict) |
| **Tier 2 (7B – 14B)** | `qwen2.5:7b`, `llama3.1:8b`, `qwen2.5-coder:7b` | 2,000 – 3,000 words | 4 – 5 steps | 0.3 |
| **Tier 3 (32B – 70B)**| `qwen2.5:32b`, `llama3.3:70b`, `deepseek-r1:32b` | 5,000+ words | 6 – 8 steps (Deep ReAct)| 0.5 |

---

## 📦 Required Dependencies

Execute inside root directory (`d:\UIT\NamBonUIT\nostrpulse-full`):
```bash
npm install openai cheerio turndown dotenv
npm install -D @types/turndown
```

---

## 🗂️ Target File Structure

```
src/agent/
├── config.ts             # Dynamic model tier & parameter configuration
├── types.ts              # Universal interfaces & tool definitions
├── tools/
│   ├── search.ts         # DuckDuckGo search scraper (No API key)
│   └── scrape.ts         # Fast HTML-to-Markdown extractor with adaptive cut-off
├── prompts.ts            # Tier-aware system prompts (1B vs 7B+)
├── orchestrator.ts       # Adaptive ReAct loop with guardrails
└── cli.ts                # Universal Terminal CLI with `--model` flag
```

---

## 📋 Implementation Tasks

### Task 1: Tier Config & Types (`src/agent/config.ts` & `src/agent/types.ts`)
- **`config.ts`**:
  - Export `getModelTier(modelName: string)`: Automatically categorizes model into Tier 1 (1B-3B), Tier 2 (7B-14B), or Tier 3 (32B+).
  - Export tier settings: `maxWordsPerScrape`, `maxSteps`, `temperature`.
  - Default model: `process.env.OLLAMA_MODEL || 'qwen2.5-coder:1.5b'`.
  - Default endpoint: `process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1'`.
- **`types.ts`**:
  - `SearchResult { title: string; url: string; snippet: string }`
  - `ScrapeResult { url: string; content: string; wordCount: number }`
  - OpenAI-compatible Tool Definitions for `search_web` and `read_page`.

### Task 2: Free Search Tool (`src/agent/tools/search.ts`)
- Scrape DuckDuckGo HTML endpoint: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`.
- Parse results via `cheerio` (`.result__title`, `.result__url`, `.result__snippet`).
- Unpack redirect URLs (`//duckduckgo.com/l/?uddg=...`).
- Return top `limit` results (default: 5).

### Task 3: Adaptive Scraper (`src/agent/tools/scrape.ts`)
- Fetch HTML with standard browser headers.
- Strip noise via `cheerio` (`script`, `style`, `nav`, `footer`, `header`, `aside`, `.ads`, `.sidebar`, etc.).
- Convert body to Markdown using `turndown`.
- Truncate cleanly according to active model's `maxWordsPerScrape`.
- Return `ScrapeResult`.

### Task 4: Tier-Aware Prompts (`src/agent/prompts.ts`)
- **Tier 1 Prompt (1B - 3B):** Ultra-concise, imperative instructions. Emphasize calling `search_web` then `read_page` sequentially, outputting direct Vietnamese/English answers with source links.
- **Tier 2+ Prompt (7B+):** Supports multi-angle query expansion, comparative synthesis, and structured report output.

### Task 5: Adaptive Orchestrator Loop (`src/agent/orchestrator.ts`)
- Initialize `OpenAI` client pointing to Ollama endpoint.
- Support runtime model override: `runAgent(userQuery, { model?: string, onStep?: (s: string) => void })`.
- Execution loop:
  1. Call model with tools enabled.
  2. If `tool_calls` present and `stepCount < maxSteps`:
     - Dispatch tool (`search_web` or `read_page`).
     - Emit progress callback for CLI/UI.
     - Append response to message history.
     - Continue loop.
  3. If `stepCount >= maxSteps` or model emits text: finalize answer with citations.

### Task 6: CLI Runner with Model Selector (`src/agent/cli.ts`)
- Interactive CLI accepting arguments: `npm run agent -- --model qwen2.5:7b` or default `qwen2.5-coder:1.5b`.
- Show active Model, Tier, and Settings banner upon start.
- Add npm script in `package.json`:
  ```json
  "agent": "ts-node src/agent/cli.ts"
  ```

---

## 🧪 Verification & Acceptance Criteria

1. **Ollama Multi-Model Readiness:**
   - Verify active model responds: `curl http://localhost:11434/api/tags`
2. **Tier 1 (1.5B) Verification:**
   - Run `npx ts-node src/agent/cli.ts --model qwen2.5-coder:1.5b`
   - Ask real-time question: *"Tin tức công nghệ mới nhất hôm nay"*
   - Ensure tool calls finish within <= 3 steps and no memory exhaustion.
3. **TypeScript Integrity:**
   - Run `npx tsc --noEmit` -> Must pass with **0 errors**.
