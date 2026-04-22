# API Notes

This prototype intentionally makes two opinionated changes:

1. Search and grounding are separate endpoints.
2. Every response uses the same top-level envelope.

## Important Prototype Semantics

- `includeDomains` and `excludeDomains` are enforced by the wrapper on returned results.
- `freshness` is a wrapper-side policy. It filters dated results when upstream dates are available and emits a warning when freshness cannot be verified.
- `maxContentResults` is enforced by the wrapper in `/v1/search/ground`, so enrichment is preserved only on the first N normalized results.

## Common Envelope

```json
{
  "requestId": "req_123",
  "outcome": {
    "code": "OK",
    "message": "Search completed successfully."
  },
  "partial": false,
  "results": [],
  "diagnostics": {},
  "credits": {},
  "errors": []
}
```

## Outcome Codes

- `OK`
- `NO_MATCHES`
- `PARTIAL_RESULTS`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_UNAVAILABLE`
- `INVALID_REQUEST`
- `CONFIGURATION_ERROR`
- `UNKNOWN_ERROR`

## Request Normalization

- `query` is trimmed before execution.
- `sources`, `includeDomains`, and `excludeDomains` are deduplicated.
- domain filters are normalized to hostnames, so values like `Docs.Firecrawl.dev/path` become `docs.firecrawl.dev`.
- overlapping `includeDomains` and `excludeDomains` are rejected at validation time.
- `maxContentResults` cannot be greater than `limit` on `/v1/search/ground`.

## Outcome Precedence

The wrapper prefers explicit failure causes over ambiguous empty responses:

1. configuration and validation failures
2. upstream timeout or unavailability
3. partial-result conditions
4. `NO_MATCHES`
5. `OK`

## Design Choice

When upstream Firecrawl behavior is ambiguous, this wrapper prefers clarity over pass-through fidelity. It preserves upstream details in `diagnostics.debug` when `debug=true`.
