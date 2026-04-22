import { z } from "zod";
declare const outcomeCodeSchema: z.ZodEnum<{
    OK: "OK";
    NO_MATCHES: "NO_MATCHES";
    PARTIAL_RESULTS: "PARTIAL_RESULTS";
    UPSTREAM_TIMEOUT: "UPSTREAM_TIMEOUT";
    UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE";
    INVALID_REQUEST: "INVALID_REQUEST";
    CONFIGURATION_ERROR: "CONFIGURATION_ERROR";
    UNKNOWN_ERROR: "UNKNOWN_ERROR";
}>;
export declare const prototypeSearchRequestSchema: z.ZodObject<{
    query: z.ZodString;
    limit: z.ZodDefault<z.ZodNumber>;
    sources: z.ZodPipe<z.ZodDefault<z.ZodArray<z.ZodEnum<{
        web: "web";
        news: "news";
        images: "images";
    }>>>, z.ZodTransform<("web" | "news" | "images")[], ("web" | "news" | "images")[]>>;
    includeDomains: z.ZodPipe<z.ZodDefault<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>>, z.ZodTransform<string[], string[]>>;
    excludeDomains: z.ZodPipe<z.ZodDefault<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>>, z.ZodTransform<string[], string[]>>;
    freshness: z.ZodDefault<z.ZodEnum<{
        any: "any";
        recent: "recent";
        strict: "strict";
    }>>;
    location: z.ZodOptional<z.ZodString>;
    debug: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const prototypeGroundRequestSchema: z.ZodObject<{
    query: z.ZodString;
    limit: z.ZodDefault<z.ZodNumber>;
    sources: z.ZodPipe<z.ZodDefault<z.ZodArray<z.ZodEnum<{
        web: "web";
        news: "news";
        images: "images";
    }>>>, z.ZodTransform<("web" | "news" | "images")[], ("web" | "news" | "images")[]>>;
    includeDomains: z.ZodPipe<z.ZodDefault<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>>, z.ZodTransform<string[], string[]>>;
    excludeDomains: z.ZodPipe<z.ZodDefault<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>>, z.ZodTransform<string[], string[]>>;
    freshness: z.ZodDefault<z.ZodEnum<{
        any: "any";
        recent: "recent";
        strict: "strict";
    }>>;
    location: z.ZodOptional<z.ZodString>;
    debug: z.ZodDefault<z.ZodBoolean>;
    contentMode: z.ZodDefault<z.ZodEnum<{
        summary: "summary";
        markdown: "markdown";
    }>>;
    maxContentResults: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type PrototypeSearchRequest = z.infer<typeof prototypeSearchRequestSchema>;
export type PrototypeGroundRequest = z.infer<typeof prototypeGroundRequestSchema>;
export type PrototypeMode = "search" | "ground";
export type UpstreamError = {
    code: string;
    stage: string;
    message: string;
    url?: string;
};
export type UpstreamItem = {
    title: string;
    url: string;
    description?: string;
    snippet?: string;
    position?: number;
    markdown?: string;
    source: "web" | "news" | "images";
    imageUrl?: string;
    date?: string;
    metadata?: Record<string, unknown>;
    error?: string;
};
export type UpstreamSearchResponse = {
    requestId: string;
    partial: boolean;
    environment: "fixture" | "live";
    durationMs: number;
    usedFixture: string | null;
    statusCode: number;
    creditsUsed: number;
    warnings: string[];
    provider: string;
    raw?: unknown;
    items: UpstreamItem[];
    errors: UpstreamError[];
};
export type PrototypeResponse = {
    requestId: string;
    outcome: {
        code: z.infer<typeof outcomeCodeSchema>;
        message: string;
    };
    partial: boolean;
    results: Array<{
        id: string;
        title: string;
        url: string;
        snippet: string | null;
        source: "web" | "news" | "images";
        position: number | null;
        score: number | null;
        content: string | null;
        imageUrl: string | null;
        publishedAt: string | null;
        provenance: {
            domain: string | null;
            sourceType: "web" | "news" | "images";
            inferred: boolean;
        };
    }>;
    diagnostics: {
        normalizedQuery: string;
        requestedLimit: number;
        returnedCount: number;
        filteredCount: number;
        durationMs: number;
        sourceMode: PrototypeMode;
        provider: string;
        environment: "fixture" | "live";
        warnings: string[];
        usedFixture: string | null;
        debug?: {
            rawUpstream?: unknown;
            includeDomains: string[];
            excludeDomains: string[];
            freshness: "any" | "recent" | "strict";
        };
    };
    credits: {
        estimated: number;
        used: number;
        currency: "credits";
    };
    errors: UpstreamError[];
};
export declare function determineOutcome(response: UpstreamSearchResponse): PrototypeResponse["outcome"];
export declare function normalizePrototypeResponse(request: PrototypeSearchRequest | PrototypeGroundRequest, response: UpstreamSearchResponse, mode: PrototypeMode): PrototypeResponse;
export {};
