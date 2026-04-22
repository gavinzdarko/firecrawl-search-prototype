import { z } from "zod";
const sourceSchema = z.enum(["web", "news", "images"]);
const freshnessSchema = z.enum(["any", "recent", "strict"]);
const outcomeCodeSchema = z.enum([
    "OK",
    "NO_MATCHES",
    "PARTIAL_RESULTS",
    "UPSTREAM_TIMEOUT",
    "UPSTREAM_UNAVAILABLE",
    "INVALID_REQUEST",
    "CONFIGURATION_ERROR",
    "UNKNOWN_ERROR",
]);
function normalizeDomain(value) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        return trimmed;
    }
    try {
        const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
        return new URL(candidate).hostname;
    }
    catch {
        return trimmed.replace(/\/+$/, "");
    }
}
const domainSchema = z.string().trim().min(1).max(255).transform(normalizeDomain);
function uniqueValues(values) {
    return Array.from(new Set(values));
}
const basePrototypeRequestSchema = z
    .object({
    query: z.string().trim().min(1).max(500),
    limit: z.number().int().positive().max(20).default(5),
    sources: z.array(sourceSchema).min(1).default(["web"]).transform(uniqueValues),
    includeDomains: z.array(domainSchema).default([]).transform(uniqueValues),
    excludeDomains: z.array(domainSchema).default([]).transform(uniqueValues),
    freshness: freshnessSchema.default("any"),
    location: z.string().trim().min(1).optional(),
    debug: z.boolean().default(false),
})
    .superRefine((value, ctx) => {
    const overlappingDomains = value.includeDomains.filter((domain) => value.excludeDomains.includes(domain));
    if (overlappingDomains.length > 0) {
        ctx.addIssue({
            code: "custom",
            path: ["includeDomains"],
            message: `includeDomains and excludeDomains overlap: ${overlappingDomains.join(", ")}`,
        });
    }
});
export const prototypeSearchRequestSchema = basePrototypeRequestSchema;
export const prototypeGroundRequestSchema = basePrototypeRequestSchema
    .extend({
    contentMode: z.enum(["summary", "markdown"]).default("markdown"),
    maxContentResults: z.number().int().positive().max(10).default(3),
})
    .superRefine((value, ctx) => {
    if (value.maxContentResults > value.limit) {
        ctx.addIssue({
            code: "custom",
            path: ["maxContentResults"],
            message: "maxContentResults cannot be greater than limit.",
        });
    }
});
function normalizeQuery(query) {
    return query.trim().replace(/\s+/g, " ");
}
function getDomain(url) {
    try {
        return new URL(url).hostname;
    }
    catch {
        return null;
    }
}
function estimateCredits(limit, mode) {
    const searchCredits = Math.ceil(limit / 10) * 2;
    return mode === "ground" ? searchCredits + limit : searchCredits;
}
function hasErrorCode(response, code) {
    return response.errors.some((error) => error.code === code);
}
function isPartialResponse(response) {
    return response.partial || (response.items.length > 0 && response.errors.length > 0);
}
function scoreFromPosition(position) {
    if (!position || position < 1) {
        return null;
    }
    return Number(Math.max(0.05, 1 - (position - 1) * 0.1).toFixed(2));
}
export function determineOutcome(response) {
    if (hasErrorCode(response, "CONFIGURATION_ERROR")) {
        return {
            code: "CONFIGURATION_ERROR",
            message: "The search wrapper is missing required configuration.",
        };
    }
    if (hasErrorCode(response, "INVALID_REQUEST")) {
        return {
            code: "INVALID_REQUEST",
            message: "The search request was rejected before execution.",
        };
    }
    if (response.errors.some((error) => error.code === "UPSTREAM_TIMEOUT")) {
        return {
            code: "UPSTREAM_TIMEOUT",
            message: "The upstream search provider timed out.",
        };
    }
    if (response.errors.some((error) => ["UPSTREAM_UNAVAILABLE", "MALFORMED_UPSTREAM_RESPONSE"].includes(error.code))) {
        return {
            code: "UPSTREAM_UNAVAILABLE",
            message: "The upstream search provider was unavailable.",
        };
    }
    if (isPartialResponse(response)) {
        return {
            code: "PARTIAL_RESULTS",
            message: "The search completed with partial results.",
        };
    }
    if (response.items.length === 0) {
        return {
            code: "NO_MATCHES",
            message: "No matching results were returned.",
        };
    }
    if (response.errors.length > 0) {
        return {
            code: "UNKNOWN_ERROR",
            message: "The search completed with an unknown upstream issue.",
        };
    }
    return {
        code: "OK",
        message: "Search completed successfully.",
    };
}
export function normalizePrototypeResponse(request, response, mode) {
    const normalizedQuery = normalizeQuery(request.query);
    const partial = isPartialResponse(response);
    return {
        requestId: response.requestId,
        outcome: determineOutcome(response),
        partial,
        results: response.items.map((item, index) => ({
            id: `${item.source}_${index + 1}`,
            title: item.title,
            url: item.url,
            snippet: item.description?.trim() || item.snippet?.trim() || null,
            source: item.source,
            position: item.position ?? null,
            score: scoreFromPosition(item.position),
            content: mode === "ground" ? item.markdown?.trim() || null : null,
            imageUrl: item.imageUrl ?? null,
            publishedAt: item.date ?? null,
            provenance: {
                domain: getDomain(item.url),
                sourceType: item.source,
                inferred: true,
            },
        })),
        diagnostics: {
            normalizedQuery,
            requestedLimit: request.limit,
            returnedCount: response.items.length,
            filteredCount: Math.max(0, request.limit - response.items.length),
            durationMs: response.durationMs,
            sourceMode: mode,
            provider: response.provider,
            environment: response.environment,
            warnings: response.warnings,
            usedFixture: response.usedFixture,
            debug: request.debug
                ? {
                    rawUpstream: response.raw,
                    includeDomains: request.includeDomains,
                    excludeDomains: request.excludeDomains,
                    freshness: request.freshness,
                }
                : undefined,
        },
        credits: {
            estimated: estimateCredits(request.limit, mode),
            used: response.creditsUsed,
            currency: "credits",
        },
        errors: response.errors,
    };
}
