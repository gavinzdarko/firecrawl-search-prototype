import {
  PrototypeGroundRequest,
  PrototypeMode,
  PrototypeSearchRequest,
  UpstreamError,
  UpstreamItem,
  UpstreamSearchResponse,
} from "@prototype/core";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { z } from "zod";

type AdapterOptions = {
  apiKey?: string;
  baseUrl: string;
  timeoutMs: number;
  useFixtures: boolean;
  fixtureRoot: URL;
};

type SearchContext = {
  mode: PrototypeMode;
};

type FirecrawlPayload = {
  success?: boolean;
  warning?: string | string[];
  creditsUsed?: number;
  _fixtureMeta?: {
    statusCode?: number;
  };
  data?: {
    web?: unknown[];
    news?: unknown[];
    images?: unknown[];
  };
};

const firecrawlItemSchema = z
  .object({
    title: z.string().trim().min(1),
    url: z.string().url(),
    description: z.string().optional(),
    snippet: z.string().optional(),
    position: z.number().int().positive().optional(),
    markdown: z.string().optional(),
    imageUrl: z.string().url().optional(),
    date: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    error: z.string().optional(),
  })
  .passthrough();

const firecrawlPayloadSchema = z
  .object({
    success: z.boolean().optional(),
    warning: z.union([z.string(), z.array(z.string())]).optional(),
    creditsUsed: z.number().int().nonnegative().optional(),
    data: z
      .object({
        web: z.array(z.unknown()).optional(),
        news: z.array(z.unknown()).optional(),
        images: z.array(z.unknown()).optional(),
      })
      .optional(),
  })
  .passthrough();

function chooseFixtureName(
  request: PrototypeSearchRequest | PrototypeGroundRequest,
  mode: PrototypeMode,
): string {
  if (request.query.toLowerCase().includes("system issue")) {
    return "system-issue.json";
  }

  if (request.query.toLowerCase().includes("timeout")) {
    return "timeout.json";
  }

  if (request.query.toLowerCase().includes("no results")) {
    return "no-results.json";
  }

  if (request.query.toLowerCase().includes("partial")) {
    return "partial.json";
  }

  return mode === "ground" ? "ground-success.json" : "search-success.json";
}

async function readFixture(fixtureRoot: URL, fixtureName: string): Promise<FirecrawlPayload> {
  const contents = await readFile(new URL(fixtureName, fixtureRoot), "utf8");
  return JSON.parse(contents) as FirecrawlPayload;
}

function normalizeWarnings(warning?: string | string[]): string[] {
  if (!warning) {
    return [];
  }

  return Array.isArray(warning) ? warning : [warning];
}

function parseItems(
  source: "web" | "news" | "images",
  items: unknown[] | undefined,
): { items: UpstreamItem[]; errors: UpstreamError[] } {
  if (!items) {
    return { items: [], errors: [] };
  }

  const validItems: UpstreamItem[] = [];
  const errors: UpstreamError[] = [];

  for (const [index, item] of items.entries()) {
    const parsedItem = firecrawlItemSchema.safeParse(item);
    if (!parsedItem.success) {
      errors.push({
        code: "MALFORMED_UPSTREAM_RESPONSE",
        stage: "provider",
        message: `Invalid ${source} result at index ${index}: ${parsedItem.error.issues
          .map((issue) => issue.message)
          .join(", ")}`,
      });
      continue;
    }

    const normalizedItem = { ...parsedItem.data, source } satisfies UpstreamItem;
    validItems.push(normalizedItem);

    if (normalizedItem.error) {
      errors.push({
        code: "PARTIAL_ENRICHMENT_FAILURE",
        stage: "scrape",
        message: normalizedItem.error,
        url: normalizedItem.url,
      });
    }
  }

  return { items: validItems, errors };
}

function normalizePayload(payload: unknown): {
  payload: FirecrawlPayload;
  items: UpstreamItem[];
  warnings: string[];
  errors: UpstreamError[];
} {
  const parsedPayload = firecrawlPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return {
      payload: {},
      items: [],
      warnings: [],
      errors: [
        {
          code: "MALFORMED_UPSTREAM_RESPONSE",
          stage: "provider",
          message: parsedPayload.error.issues.map((issue) => issue.message).join(", "),
        },
      ],
    };
  }

  const normalizedPayload = parsedPayload.data;
  const webItems = parseItems("web", normalizedPayload.data?.web);
  const newsItems = parseItems("news", normalizedPayload.data?.news);
  const imageItems = parseItems("images", normalizedPayload.data?.images);

  return {
    payload: normalizedPayload,
    items: [...webItems.items, ...newsItems.items, ...imageItems.items],
    warnings: normalizeWarnings(normalizedPayload.warning),
    errors: [...webItems.errors, ...newsItems.errors, ...imageItems.errors],
  };
}

function classifyErrors(payload: FirecrawlPayload, statusCode: number): UpstreamError[] {
  const errors: UpstreamError[] = [];

  if (statusCode >= 500) {
    errors.push({
      code: "UPSTREAM_UNAVAILABLE",
      stage: "provider",
      message: "Firecrawl returned a 5xx response.",
    });
  }

  if (statusCode === 408) {
    errors.push({
      code: "UPSTREAM_TIMEOUT",
      stage: "provider",
      message: "Firecrawl timed out before returning a response.",
    });
  }

  if (payload.success === false) {
    errors.push({
      code: "UPSTREAM_UNAVAILABLE",
      stage: "provider",
      message: "Firecrawl marked the request as unsuccessful.",
    });
  }

  return errors;
}

function inferPartialState(
  warnings: string[],
  errors: UpstreamError[],
  items: UpstreamItem[],
): boolean {
  if (errors.some((error) => error.code === "PARTIAL_ENRICHMENT_FAILURE")) {
    return true;
  }

  if (
    items.length > 0 &&
    warnings.some((warning) => /partial|could not be enriched/i.test(warning))
  ) {
    return true;
  }

  return false;
}

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function parseDateMs(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function applyDomainFilters(
  items: UpstreamItem[],
  includeDomains: string[],
  excludeDomains: string[],
): { items: UpstreamItem[]; filteredCount: number } {
  if (includeDomains.length === 0 && excludeDomains.length === 0) {
    return { items, filteredCount: 0 };
  }

  const includeSet = new Set(includeDomains.map((domain) => domain.toLowerCase()));
  const excludeSet = new Set(excludeDomains.map((domain) => domain.toLowerCase()));

  const filteredItems = items.filter((item) => {
    const domain = getDomain(item.url);
    if (!domain) {
      return includeSet.size === 0;
    }

    if (excludeSet.has(domain)) {
      return false;
    }

    if (includeSet.size > 0) {
      return includeSet.has(domain);
    }

    return true;
  });

  return {
    items: filteredItems,
    filteredCount: items.length - filteredItems.length,
  };
}

function applyFreshnessPolicy(
  items: UpstreamItem[],
  freshness: PrototypeSearchRequest["freshness"],
): {
  items: UpstreamItem[];
  filteredCount: number;
  parseableDateCount: number;
  degradedReasons: string[];
  warnings: string[];
} {
  if (freshness === "any") {
    return {
      items,
      filteredCount: 0,
      parseableDateCount: items.filter((item) => parseDateMs(item.date) !== null).length,
      degradedReasons: [],
      warnings: [],
    };
  }

  const now = Date.now();
  const maxAgeMs = freshness === "strict" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  let parseableDateCount = 0;

  const filteredItems = items.filter((item) => {
    const parsedDate = parseDateMs(item.date);
    if (parsedDate === null) {
      return freshness !== "strict";
    }

    parseableDateCount += 1;
    return now - parsedDate <= maxAgeMs;
  });

  const degradedReasons: string[] = [];
  const warnings: string[] = [];

  if (parseableDateCount === 0) {
    degradedReasons.push("freshness_unverifiable");
    warnings.push("Freshness was requested, but upstream results did not include parseable dates.");
  }

  return {
    items: filteredItems,
    filteredCount: items.length - filteredItems.length,
    parseableDateCount,
    degradedReasons,
    warnings,
  };
}

function applyGroundContentLimit(
  items: UpstreamItem[],
  request: PrototypeSearchRequest | PrototypeGroundRequest,
  mode: PrototypeMode,
): { items: UpstreamItem[]; contentIncludedCount: number } {
  if (mode !== "ground") {
    return {
      items: items.map((item) => ({ ...item, markdown: undefined })),
      contentIncludedCount: 0,
    };
  }

  const groundRequest = request as PrototypeGroundRequest;
  let contentIncludedCount = 0;

  const updatedItems = items.map((item, index) => {
    if (index < groundRequest.maxContentResults) {
      if (item.markdown) {
        contentIncludedCount += 1;
      }
      return item;
    }

    return {
      ...item,
      markdown: undefined,
    };
  });

  return {
    items: updatedItems,
    contentIncludedCount,
  };
}

function applyWrapperPolicies(
  items: UpstreamItem[],
  request: PrototypeSearchRequest | PrototypeGroundRequest,
  mode: PrototypeMode,
): {
  items: UpstreamItem[];
  warnings: string[];
  stats: UpstreamSearchResponse["stats"];
} {
  const domainResult = applyDomainFilters(items, request.includeDomains, request.excludeDomains);
  const freshnessResult = applyFreshnessPolicy(domainResult.items, request.freshness);
  const groundResult = applyGroundContentLimit(freshnessResult.items, request, mode);

  const warnings = [...freshnessResult.warnings];
  if (domainResult.filteredCount > 0) {
    warnings.push(`Domain policy filtered ${domainResult.filteredCount} result(s).`);
  }
  if (freshnessResult.filteredCount > 0) {
    warnings.push(`Freshness policy filtered ${freshnessResult.filteredCount} result(s).`);
  }
  if (
    mode === "ground" &&
    "maxContentResults" in request &&
    request.maxContentResults < request.limit
  ) {
    warnings.push(`Ground mode limited enriched content to ${request.maxContentResults} result(s).`);
  }

  return {
    items: groundResult.items,
    warnings,
    stats: {
      upstreamCount: items.length,
      domainFilteredCount: domainResult.filteredCount,
      freshnessFilteredCount: freshnessResult.filteredCount,
      contentIncludedCount: groundResult.contentIncludedCount,
      parseableDateCount: freshnessResult.parseableDateCount,
      errorCount: 0,
      degradedReasons: freshnessResult.degradedReasons,
    },
  };
}

export class FirecrawlAdapter {
  constructor(private readonly options: AdapterOptions) {}

  async search(
    request: PrototypeSearchRequest | PrototypeGroundRequest,
    context: SearchContext,
  ): Promise<UpstreamSearchResponse> {
    if (this.options.useFixtures) {
      return this.searchWithFixture(request, context.mode);
    }

    if (!this.options.apiKey) {
      return {
        requestId: randomUUID(),
        partial: false,
        environment: "live",
        durationMs: 0,
        usedFixture: null,
        statusCode: 500,
        creditsUsed: 0,
        warnings: ["No Firecrawl API key configured."],
        provider: "firecrawl",
        items: [],
        errors: [
          {
            code: "CONFIGURATION_ERROR",
            stage: "adapter",
            message: "Missing FIRECRAWL_API_KEY for live mode.",
          },
        ],
        stats: {
          upstreamCount: 0,
          domainFilteredCount: 0,
          freshnessFilteredCount: 0,
          contentIncludedCount: 0,
          parseableDateCount: 0,
          errorCount: 1,
          degradedReasons: [],
        },
      };
    }

    const startedAt = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const body: Record<string, unknown> = {
        query: request.query,
        limit: request.limit,
        sources: request.sources,
      };

      if (context.mode === "ground") {
        const groundRequest = request as PrototypeGroundRequest;
        body.scrapeOptions = {
          formats: [groundRequest.contentMode],
        };
      }

      const response = await fetch(`${this.options.baseUrl}/v2/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const rawPayload = (await response.json()) as unknown;
      const durationMs = Math.round(performance.now() - startedAt);
      const normalizedPayload = normalizePayload(rawPayload);
      const classifiedErrors = classifyErrors(normalizedPayload.payload, response.status);
      const policyResult = applyWrapperPolicies(normalizedPayload.items, request, context.mode);
      const errors = [...normalizedPayload.errors, ...classifiedErrors];
      const warnings = [...normalizedPayload.warnings, ...policyResult.warnings];
      const partial = inferPartialState(warnings, errors, policyResult.items);

      return {
        requestId: randomUUID(),
        partial,
        environment: "live",
        durationMs,
        usedFixture: null,
        statusCode: response.status,
        creditsUsed: normalizedPayload.payload.creditsUsed ?? 0,
        warnings,
        provider: "firecrawl",
        raw: rawPayload,
        items: policyResult.items,
        errors,
        stats: {
          ...policyResult.stats,
          errorCount: errors.length,
        },
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      const isAbort = error instanceof Error && error.name === "AbortError";
      return {
        requestId: randomUUID(),
        partial: false,
        environment: "live",
        durationMs,
        usedFixture: null,
        statusCode: isAbort ? 408 : 500,
        creditsUsed: 0,
        warnings: [],
        provider: "firecrawl",
        items: [],
        errors: [
          {
            code: isAbort ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
            stage: "provider",
            message: isAbort ? "The Firecrawl request timed out." : "The Firecrawl request failed.",
          },
        ],
        stats: {
          upstreamCount: 0,
          domainFilteredCount: 0,
          freshnessFilteredCount: 0,
          contentIncludedCount: 0,
          parseableDateCount: 0,
          errorCount: 1,
          degradedReasons: [],
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async searchWithFixture(
    request: PrototypeSearchRequest | PrototypeGroundRequest,
    mode: PrototypeMode,
  ): Promise<UpstreamSearchResponse> {
    const fixtureName = chooseFixtureName(request, mode);
    const startedAt = performance.now();
    const payload = await readFixture(this.options.fixtureRoot, fixtureName);
    const durationMs = Math.round(performance.now() - startedAt);
    const normalizedPayload = normalizePayload(payload);
    const policyResult = applyWrapperPolicies(normalizedPayload.items, request, mode);
    const items = policyResult.items.slice(0, request.limit);
    const statusCode = payload._fixtureMeta?.statusCode ?? 200;
    const classifiedErrors = classifyErrors(payload, statusCode);
    const errors = [...normalizedPayload.errors, ...classifiedErrors];
    const warnings = [...normalizedPayload.warnings, ...policyResult.warnings];
    const partial = inferPartialState(warnings, errors, items);

    return {
      requestId: randomUUID(),
      partial,
      environment: "fixture",
      durationMs,
      usedFixture: fixtureName,
      statusCode,
      creditsUsed: normalizedPayload.payload.creditsUsed ?? 0,
      warnings,
      provider: "fixture",
      raw: payload,
      items,
      errors,
      stats: {
        ...policyResult.stats,
        errorCount: errors.length,
      },
    };
  }
}
