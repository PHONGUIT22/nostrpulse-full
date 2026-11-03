// scripts/run-all-tests.ts
import { spawn } from "child_process";
import path from "path";

interface TestSuite {
  name: string;
  file: string;
  description: string;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: "RFC 8949 CBOR & NIP-59 GiftWrap",
    file: "scripts/test-cbor-and-giftwrap-nutzap.ts",
    description: "Zero-Buffer CBOR round-trip & NIP-59 metadata privacy",
  },
  {
    name: "Spending Guardrails Policy",
    file: "scripts/test-guardrails-policy.ts",
    description: "Tx cap, 24h rolling budget & SQLite persistence",
  },
  {
    name: "Agent Identity & Guardrails",
    file: "scripts/test-guardrails.ts",
    description: "Zero-config key management & spending limits",
  },
  {
    name: "Guardrails & Telemetry Trail",
    file: "scripts/test-guardrails-and-telemetry.ts",
    description: "Budget manager & structured telemetry events",
  },
  {
    name: "NIP-47 NWC Lightning Rails",
    file: "scripts/test-nwc.ts",
    description: "URI parsing, NIP-04/44 encryption & payment timeouts",
  },
  {
    name: "Tool Registry & MCP Schema",
    file: "scripts/test-tool-registry.ts",
    description: "DVMCP schema mapping to Zod & registry binding",
  },
  {
    name: "MCP Client Profiles",
    file: "scripts/test-profiles.ts",
    description: "Minimal, Radar, Payment, and Full tool surface gates",
  },
  {
    name: "Security & Reliability Enhancements",
    file: "scripts/test-security-enhancements.ts",
    description: "SSRF protection, AsyncMutex & Hop-2 WoT resolution",
  },
];

interface TestResult {
  name: string;
  description: string;
  passed: boolean;
  durationMs: number;
  errorOutput?: string;
}

async function runSingleTest(suite: TestSuite): Promise<TestResult> {
  const start = Date.now();
  const rootDir = path.resolve(__dirname, "..");
  const tsxCli = path.resolve(rootDir, "node_modules/tsx/dist/cli.mjs");

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsxCli, suite.file], {
      cwd: rootDir,
      env: { ...process.env, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("close", (code) => {
      const durationMs = Date.now() - start;
      resolve({
        name: suite.name,
        description: suite.description,
        passed: code === 0,
        durationMs,
        errorOutput: code !== 0 ? output : undefined,
      });
    });
  });
}

async function main() {
  console.log("===============================================================================");
  console.log("     NOSTRPULSE UNIFIED TEST SUITE RUNNER (HRF / OPENSATS SPECIFICATION)       ");
  console.log("===============================================================================");
  console.log(`Executing ${TEST_SUITES.length} deterministic core test suites in sequence...\n`);

  const results: TestResult[] = [];
  let allPassed = true;

  for (let i = 0; i < TEST_SUITES.length; i++) {
    const suite = TEST_SUITES[i];
    process.stdout.write(`[${i + 1}/${TEST_SUITES.length}] Running ${suite.name}... `);
    const result = await runSingleTest(suite);
    results.push(result);

    if (result.passed) {
      console.log(`✔ PASS (${result.durationMs}ms)`);
    } else {
      console.log(`✖ FAIL (${result.durationMs}ms)`);
      allPassed = false;
    }
  }

  console.log("\n===============================================================================");
  console.log("                           TEST EXECUTION SUMMARY                              ");
  console.log("===============================================================================");
  console.log(
    "| Status | Suite Name                           | Duration | Purpose"
  );
  console.log(
    "|:------:|:-------------------------------------|:--------:|:---------------------------------"
  );

  for (const r of results) {
    const statusIcon = r.passed ? "✔ PASS" : "✖ FAIL";
    const namePadded = r.name.padEnd(36, " ");
    const durationPadded = `${r.durationMs}ms`.padStart(8, " ");
    console.log(`| ${statusIcon} | ${namePadded} | ${durationPadded} | ${r.description}`);
  }

  console.log("===============================================================================");

  if (!allPassed) {
    console.error("\n[!] The following test suite(s) failed:\n");
    for (const r of results) {
      if (!r.passed) {
        console.error(`--- ${r.name} Error Output ---`);
        console.error(r.errorOutput);
        console.error("-------------------------------------------------------------------------------");
      }
    }
    process.exit(1);
  }

  const totalTime = results.reduce((acc, r) => acc + r.durationMs, 0);
  console.log(`>>> ALL ${results.length} TEST SUITES PASSED SUCCESSFULLY IN ${(totalTime / 1000).toFixed(2)}s! <<<`);
  console.log("===============================================================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test runner encountered unexpected error:", err);
  process.exit(1);
});
