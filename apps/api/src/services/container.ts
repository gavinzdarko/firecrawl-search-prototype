import { FirecrawlAdapter } from "@prototype/firecrawl-adapter";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, shouldUseFixtures } from "../lib/env.js";

function resolveFixtureRoot(): URL {
  let currentDir = path.dirname(fileURLToPath(import.meta.url));

  for (let index = 0; index < 8; index += 1) {
    const candidate = path.join(currentDir, "fixtures", "firecrawl", "search-success.json");
    if (existsSync(candidate)) {
      return new URL(`file://${path.join(currentDir, "fixtures", "firecrawl")}/`);
    }

    currentDir = path.dirname(currentDir);
  }

  throw new Error("Could not locate fixtures/firecrawl from the API entrypoint.");
}

const fixtureRoot = resolveFixtureRoot();

export const adapter = new FirecrawlAdapter({
  apiKey: env.FIRECRAWL_API_KEY,
  baseUrl: env.FIRECRAWL_BASE_URL,
  timeoutMs: env.PROTOTYPE_REQUEST_TIMEOUT_MS,
  useFixtures: shouldUseFixtures(),
  fixtureRoot,
});
