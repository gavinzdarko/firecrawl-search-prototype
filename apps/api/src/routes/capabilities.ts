import { FastifyInstance } from "fastify";
import { env, shouldUseFixtures } from "../lib/env.js";

export async function registerCapabilitiesRoute(app: FastifyInstance) {
  app.get("/v1/capabilities", async () => ({
    requestId: crypto.randomUUID(),
    environment: shouldUseFixtures() ? "fixture" : "live",
    firecrawlBaseUrl: env.FIRECRAWL_BASE_URL,
    liveConfigured: Boolean(env.FIRECRAWL_API_KEY),
    modes: ["search", "ground"],
    sources: ["web", "news", "images"],
    features: {
      debug: true,
      includeDomains: true,
      excludeDomains: true,
      freshness: true,
      contentMode: true,
      explicitPartialResults: true,
    },
    limitations: [
      "Ranking score is inferred when upstream data does not provide one.",
      "Freshness metadata is best-effort and may be null in live mode.",
      "This prototype focuses on contract quality, not ranking changes.",
    ],
  }));
}

