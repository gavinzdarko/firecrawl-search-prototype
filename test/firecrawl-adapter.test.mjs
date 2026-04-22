import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { prototypeGroundRequestSchema, prototypeSearchRequestSchema } from "@prototype/core";
import { FirecrawlAdapter } from "@prototype/firecrawl-adapter";

const fixtureRoot = new URL("../fixtures/firecrawl/", import.meta.url);

function createFixtureAdapter(overrides = {}) {
  return new FirecrawlAdapter({
    apiKey: undefined,
    baseUrl: "https://api.firecrawl.dev",
    timeoutMs: 500,
    useFixtures: true,
    fixtureRoot,
    ...overrides,
  });
}

test("fixture mode returns normalized successful search results", async () => {
  const adapter = createFixtureAdapter();
  const request = prototypeSearchRequestSchema.parse({
    query: "firecrawl docs",
    limit: 2,
  });

  const response = await adapter.search(request, { mode: "search" });

  assert.equal(response.environment, "fixture");
  assert.equal(response.usedFixture, "search-success.json");
  assert.equal(response.partial, false);
  assert.equal(response.items.length, 2);
  assert.equal(response.items[0]?.source, "web");
  assert.equal(response.errors.length, 0);
});

test("fixture mode marks partial enrichment scenarios explicitly", async () => {
  const adapter = createFixtureAdapter();
  const request = prototypeGroundRequestSchema.parse({
    query: "partial firecrawl",
    limit: 5,
  });

  const response = await adapter.search(request, { mode: "ground" });

  assert.equal(response.partial, true);
  assert.match(response.warnings[0] ?? "", /could not be enriched/i);
  assert.ok(
    response.errors.some((error) => error.code === "PARTIAL_ENRICHMENT_FAILURE"),
    "expected a typed partial enrichment error",
  );
});

test("live mode without an API key returns a configuration error", async () => {
  const adapter = new FirecrawlAdapter({
    apiKey: undefined,
    baseUrl: "https://api.firecrawl.dev",
    timeoutMs: 500,
    useFixtures: false,
    fixtureRoot,
  });
  const request = prototypeSearchRequestSchema.parse({
    query: "firecrawl docs",
  });

  const response = await adapter.search(request, { mode: "search" });

  assert.equal(response.errors[0]?.code, "CONFIGURATION_ERROR");
  assert.equal(response.items.length, 0);
});

test("malformed fixture payloads are surfaced as upstream response errors", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "firecrawl-prototype-"));

  try {
    await writeFile(
      join(tempRoot, "search-success.json"),
      JSON.stringify({
        success: true,
        creditsUsed: 2,
        data: {
          web: [
            {
              title: "Missing URL",
            },
          ],
        },
      }),
    );

    const adapter = createFixtureAdapter({
      fixtureRoot: new URL(`file://${tempRoot}/`),
    });
    const request = prototypeSearchRequestSchema.parse({
      query: "firecrawl malformed",
    });

    const response = await adapter.search(request, { mode: "search" });

    assert.equal(response.items.length, 0);
    assert.equal(response.errors[0]?.code, "MALFORMED_UPSTREAM_RESPONSE");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
