# Firecrawl Search Prototype

This repo prototypes a better search contract on top of the Firecrawl Search API.

The goal is not to replace Firecrawl internals. The goal is to show how much clearer the product feels when a thin wrapper adds:

- a clean request model
- explicit separation between retrieval and grounding
- typed outcomes
- structured diagnostics
- normalized results across sources

## What You Get

- A Fastify API wrapper with explicit `search` and `search/ground` modes
- A comparison CLI for `raw` Firecrawl vs `improved` wrapper output
- A side-by-side browser UI for raw vs improved comparison
- Fixture-driven local development for deterministic demos
- Live mode for exercising the real Firecrawl API
- A stable response envelope with outcomes, diagnostics, and credits

## Status

Current implementation:

- `POST /v1/search`
- `POST /v1/search/ground`
- `GET /v1/capabilities`
- CLI for `raw` vs `improved` output comparison
- Web comparison UI with scenario presets
- fixture mode for deterministic local development
- live Firecrawl mode when `FIRECRAWL_API_KEY` is configured

## Why This Exists

The current Firecrawl search surface is powerful, but it blends retrieval, enrichment, and error handling into one shape. This prototype demonstrates a thinner, more explicit contract:

- `search` means retrieval
- `search/ground` means retrieval plus content enrichment
- responses always include `requestId`, `outcome`, `partial`, `results`, `diagnostics`, `credits`, and `errors`

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
npm run start:web
```

The API starts on `http://localhost:3000`.
The web UI starts on `http://localhost:4173`.

In a separate terminal, compare raw and improved output:

```bash
npm run build
npm run start:cli -- --mode improved "firecrawl funding"
npm run start:cli -- --mode raw "firecrawl funding"
```

Or use the browser UI presets to see:

- basic success
- trusted sources
- partial enrichment failure
- explicit upstream system issue
- strict freshness filtering

## Environment

Create a `.env` file in the repo root if you want live Firecrawl calls:

```bash
FIRECRAWL_API_KEY=fc-...
FIRECRAWL_BASE_URL=https://api.firecrawl.dev
PROTOTYPE_PORT=3000
PROTOTYPE_USE_FIXTURES=false
PROTOTYPE_REQUEST_TIMEOUT_MS=30000
```

If `PROTOTYPE_USE_FIXTURES=true` or no Firecrawl API key is present, the server uses local fixtures.
The wrapper enforces domain filters, freshness policy, and `maxContentResults` itself so those behaviors stay deterministic in fixture mode.

## NPM Scripts

- `npm run dev`: start the API in development mode
- `npm run build`: compile all workspaces
- `npm run typecheck`: run TypeScript checks across the repo
- `npm run check`: lint, typecheck, test-if-present, and build
- `npm run clean`: remove generated build output
- `npm run start:api`: run the compiled API server
- `npm run start:web`: start the comparison UI dev server
- `npm run start:cli -- --mode improved "query"`: run the compiled CLI

## Endpoints

### `POST /v1/search`

Retrieval only.

Example:

```bash
curl -X POST http://localhost:3000/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "firecrawl funding",
    "limit": 5,
    "includeDomains": ["firecrawl.dev"],
    "debug": true
  }'
```

### `POST /v1/search/ground`

Retrieval plus content enrichment. The wrapper preserves enriched content only on the first `maxContentResults` normalized results.

Example:

```bash
curl -X POST http://localhost:3000/v1/search/ground \
  -H "Content-Type: application/json" \
  -d '{
    "query": "firecrawl funding",
    "limit": 5,
    "contentMode": "markdown",
    "maxContentResults": 3
  }'
```

### `GET /v1/capabilities`

Reports supported modes and whether live Firecrawl access is configured.

## CLI

Compare raw upstream output against the normalized wrapper contract:

```bash
npm run build
npm run start -w @prototype/cli -- --mode improved "firecrawl funding"
npm run start -w @prototype/cli -- --mode raw "firecrawl funding"
```

You can also target live Firecrawl calls by setting `PROTOTYPE_USE_FIXTURES=false` and configuring `FIRECRAWL_API_KEY`.

## Repo Layout

- `apps/api`: Fastify API wrapper
- `apps/cli`: local comparison CLI
- `apps/web`: browser UI for side-by-side raw vs improved comparison
- `packages/core`: schemas, types, normalization, diagnostics, outcome mapping
- `packages/firecrawl-adapter`: Firecrawl transport wrapper and fixture adapter
- `fixtures/firecrawl`: fixture payloads used for local development and tests
- `docs/api.md`: contract notes

## Verification And Contribution

The published repo is currently verified through the documented local commands:

- `npm run typecheck`
- `npm run build`
- `npm test`

For contribution guidance, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Publishing Notes

If you intend to ship a hosted demo, add the deployed URL to this README after the environment is live.
