import { normalizePrototypeResponse, PrototypeMode, PrototypeSearchRequest } from "@prototype/core";
import { FirecrawlAdapter } from "@prototype/firecrawl-adapter";

type CliFlags = {
  mode: "improved" | "raw";
  query: string;
  limit: number;
  includeDomains: string[];
  excludeDomains: string[];
  debug: boolean;
};

function parseArgs(argv: string[]): CliFlags {
  const args = [...argv];
  let mode: "improved" | "raw" = "improved";
  let limit = 5;
  let debug = false;
  const includeDomains: string[] = [];
  const excludeDomains: string[] = [];
  const queryParts: string[] = [];

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) {
      continue;
    }

    if (arg === "--mode") {
      const value = args.shift();
      if (value === "raw" || value === "improved") {
        mode = value;
      }
      continue;
    }

    if (arg === "--limit") {
      const value = args.shift();
      if (value) {
        limit = Number(value);
      }
      continue;
    }

    if (arg === "--include-domain") {
      const value = args.shift();
      if (value) {
        includeDomains.push(value);
      }
      continue;
    }

    if (arg === "--exclude-domain") {
      const value = args.shift();
      if (value) {
        excludeDomains.push(value);
      }
      continue;
    }

    if (arg === "--debug") {
      debug = true;
      continue;
    }

    queryParts.push(arg);
  }

  if (queryParts.length === 0) {
    throw new Error(
      "Usage: npm run start -w @prototype/cli -- --mode improved \"firecrawl funding\" [--include-domain firecrawl.dev] [--debug]",
    );
  }

  return {
    mode,
    query: queryParts.join(" "),
    limit,
    includeDomains,
    excludeDomains,
    debug,
  };
}

function buildRequest(flags: CliFlags): PrototypeSearchRequest {
  return {
    query: flags.query,
    limit: flags.limit,
    sources: ["web"],
    includeDomains: flags.includeDomains,
    excludeDomains: flags.excludeDomains,
    freshness: "any",
    debug: flags.debug,
  };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const request = buildRequest(flags);
  const adapter = new FirecrawlAdapter({
    apiKey: process.env.FIRECRAWL_API_KEY,
    baseUrl: process.env.FIRECRAWL_BASE_URL ?? "https://api.firecrawl.dev",
    timeoutMs: Number(process.env.PROTOTYPE_REQUEST_TIMEOUT_MS ?? 30000),
    useFixtures: process.env.PROTOTYPE_USE_FIXTURES !== "false",
    fixtureRoot: new URL("../../fixtures/firecrawl/", `file://${process.cwd()}/`),
  });

  const upstream = await adapter.search(request, { mode: "search" as PrototypeMode });

  if (flags.mode === "raw") {
    console.log(JSON.stringify(upstream.raw ?? upstream, null, 2));
    return;
  }

  const normalized = normalizePrototypeResponse(request, upstream, "search");
  console.log(JSON.stringify(normalized, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown CLI error";
  console.error(message);
  process.exitCode = 1;
});
