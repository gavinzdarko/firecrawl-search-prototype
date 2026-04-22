import { FirecrawlAdapter } from "@prototype/firecrawl-adapter";
import { env, shouldUseFixtures } from "../lib/env.js";

const fixtureRoot = new URL("../../fixtures/firecrawl/", `file://${process.cwd()}/`);

export const adapter = new FirecrawlAdapter({
  apiKey: env.FIRECRAWL_API_KEY,
  baseUrl: env.FIRECRAWL_BASE_URL,
  timeoutMs: env.PROTOTYPE_REQUEST_TIMEOUT_MS,
  useFixtures: shouldUseFixtures(),
  fixtureRoot,
});
