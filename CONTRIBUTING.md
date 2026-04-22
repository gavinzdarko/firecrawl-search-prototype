# Contributing

This repo is a prototype. Contributions are welcome if they keep the scope tight: improve the contract layer, diagnostics, demo ergonomics, and test coverage around Firecrawl Search behavior.

## Development

Requirements:

- Node.js 20+
- npm 10+

Setup:

```bash
npm install
cp .env.example .env
npm run dev
```

For local development without a Firecrawl API key, leave `PROTOTYPE_USE_FIXTURES=true`.

## Before opening a PR

Run:

```bash
npm run check
```

If you change the public contract, also update:

- `README.md`
- `docs/api.md`
- fixtures under `fixtures/firecrawl` if behavior changed

## Scope guardrails

- Keep the prototype as a wrapper on top of Firecrawl, not a Firecrawl fork.
- Prefer explicit contract clarity over trying to mimic every upstream quirk.
- Mark inferred metadata clearly when the upstream API does not provide it directly.
