import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { prototypeGroundRequestSchema, prototypeSearchRequestSchema } from "@prototype/core";
import { FirecrawlAdapter } from "@prototype/firecrawl-adapter";

const execFileAsync = promisify(execFile);
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

test("ground mode enforces maxContentResults at the wrapper layer", async () => {
  const adapter = createFixtureAdapter();
  const request = prototypeGroundRequestSchema.parse({
    query: "firecrawl grounding",
    limit: 3,
    maxContentResults: 1,
  });

  const response = await adapter.search(request, { mode: "ground" });

  assert.equal(response.items[0]?.markdown?.startsWith("#"), true);
  assert.equal(response.items[1]?.markdown, undefined);
  assert.equal(response.stats.contentIncludedCount, 1);
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

test("fixture mode can simulate an upstream system issue", async () => {
  const adapter = createFixtureAdapter();
  const request = prototypeSearchRequestSchema.parse({
    query: "system issue firecrawl",
  });

  const response = await adapter.search(request, { mode: "search" });

  assert.equal(response.statusCode, 503);
  assert.equal(response.errors[0]?.code, "UPSTREAM_UNAVAILABLE");
});

test("CLI rejects invalid limit values instead of returning misleading output", async () => {
  const cliEntry = fileURLToPath(new URL("../apps/cli/dist/apps/cli/src/index.js", import.meta.url));

  await assert.rejects(
    execFileAsync(process.execPath, [cliEntry, "--limit", "not-a-number", "firecrawl"], {
      cwd: "/tmp",
      env: {
        ...process.env,
        PROTOTYPE_USE_FIXTURES: "true",
      },
    }),
  );
});

test("CLI can resolve fixtures outside the repo working directory", async () => {
  const cliEntry = fileURLToPath(new URL("../apps/cli/dist/apps/cli/src/index.js", import.meta.url));

  const { stdout } = await execFileAsync(process.execPath, [cliEntry, "firecrawl"], {
    cwd: "/tmp",
    env: {
      ...process.env,
      PROTOTYPE_USE_FIXTURES: "true",
    },
  });

  assert.match(stdout, /Search completed successfully/);
});
