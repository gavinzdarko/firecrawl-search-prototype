import assert from "node:assert/strict";
import test from "node:test";

import {
  determineOutcome,
  normalizePrototypeResponse,
  prototypeGroundRequestSchema,
  prototypeSearchRequestSchema,
} from "@prototype/core";

function buildUpstreamResponse(overrides = {}) {
  return {
    requestId: "req_test",
    partial: false,
    environment: "fixture",
    durationMs: 12,
    usedFixture: "search-success.json",
    statusCode: 200,
    creditsUsed: 2,
    warnings: [],
    provider: "fixture",
    raw: {},
    items: [],
    errors: [],
    stats: {
      upstreamCount: 0,
      domainFilteredCount: 0,
      freshnessFilteredCount: 0,
      contentIncludedCount: 0,
      parseableDateCount: 0,
      errorCount: 0,
      degradedReasons: [],
    },
    ...overrides,
  };
}

test("prototype search request normalizes and deduplicates domain filters", () => {
  const parsed = prototypeSearchRequestSchema.parse({
    query: "  Firecrawl docs  ",
    includeDomains: ["Docs.Firecrawl.dev/path", "https://docs.firecrawl.dev"],
    excludeDomains: ["BLOG.Firecrawl.dev", "blog.firecrawl.dev/"],
    sources: ["web", "web", "news"],
  });

  assert.equal(parsed.query, "Firecrawl docs");
  assert.deepEqual(parsed.includeDomains, ["docs.firecrawl.dev"]);
  assert.deepEqual(parsed.excludeDomains, ["blog.firecrawl.dev"]);
  assert.deepEqual(parsed.sources, ["web", "news"]);
});

test("prototype request rejects overlapping include and exclude domains", () => {
  const parsed = prototypeSearchRequestSchema.safeParse({
    query: "firecrawl",
    includeDomains: ["docs.firecrawl.dev"],
    excludeDomains: ["https://docs.firecrawl.dev/search"],
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.issues[0]?.message ?? "", /overlap/i);
  }
});

test("ground request rejects maxContentResults values above limit", () => {
  const parsed = prototypeGroundRequestSchema.safeParse({
    query: "firecrawl",
    limit: 2,
    maxContentResults: 3,
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.issues[0]?.message ?? "", /cannot be greater than limit/i);
  }
});

test("normalization uses maxContentResults for content and estimated credits", () => {
  const request = prototypeGroundRequestSchema.parse({
    query: "firecrawl",
    limit: 4,
    maxContentResults: 2,
    debug: true,
  });

  const normalized = normalizePrototypeResponse(
    request,
    buildUpstreamResponse({
      items: [
        { title: "One", url: "https://one.example.com", markdown: "# One", source: "web" },
        { title: "Two", url: "https://two.example.com", markdown: "# Two", source: "web" },
        { title: "Three", url: "https://three.example.com", markdown: "# Three", source: "web" },
      ],
      stats: {
        upstreamCount: 3,
        domainFilteredCount: 0,
        freshnessFilteredCount: 0,
        contentIncludedCount: 2,
        parseableDateCount: 0,
        errorCount: 0,
        degradedReasons: [],
      },
    }),
    "ground",
  );

  assert.equal(normalized.credits.estimated, 4);
  assert.equal(normalized.diagnostics.contentIncludedCount, 2);
});

test("outcome mapping prefers configuration errors over empty no-match responses", () => {
  const outcome = determineOutcome(
    buildUpstreamResponse({
      errors: [
        {
          code: "CONFIGURATION_ERROR",
          stage: "adapter",
          message: "Missing FIRECRAWL_API_KEY for live mode.",
        },
      ],
    }),
  );

  assert.equal(outcome.code, "CONFIGURATION_ERROR");
});

test("normalization infers partial responses when results and errors coexist", () => {
  const request = prototypeGroundRequestSchema.parse({
    query: "partial firecrawl",
    limit: 2,
    maxContentResults: 2,
    debug: true,
  });

  const normalized = normalizePrototypeResponse(
    request,
    buildUpstreamResponse({
      items: [
        {
          title: "Firecrawl",
          url: "https://www.firecrawl.dev/",
          description: "Structured web data",
          markdown: "# Firecrawl",
          position: 1,
          source: "web",
        },
      ],
      errors: [
        {
          code: "PARTIAL_ENRICHMENT_FAILURE",
          stage: "scrape",
          message: "One result failed during enrichment.",
          url: "https://example.com/failure",
        },
      ],
      warnings: ["Some results could not be enriched"],
    }),
    "ground",
  );

  assert.equal(normalized.partial, true);
  assert.equal(normalized.outcome.code, "PARTIAL_RESULTS");
  assert.equal(normalized.results[0]?.content, "# Firecrawl");
  assert.equal(normalized.diagnostics.debug?.includeDomains.length, 0);
});
