import { normalizePrototypeResponse, prototypeGroundRequestSchema } from "@prototype/core";
import { FastifyInstance } from "fastify";
import { adapter } from "../services/container.js";

export async function registerGroundRoute(app: FastifyInstance) {
  app.post("/v1/search/ground", async (request, reply) => {
    const parsed = prototypeGroundRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        requestId: crypto.randomUUID(),
        outcome: {
          code: "INVALID_REQUEST",
          message: "Request body did not match the prototype schema.",
        },
        partial: false,
        results: [],
        diagnostics: {
          normalizedQuery: "",
          requestedLimit: 0,
          returnedCount: 0,
          filteredCount: 0,
          durationMs: 0,
          sourceMode: "ground",
        },
        credits: {
          estimated: 0,
          used: 0,
          currency: "credits",
        },
        errors: parsed.error.issues.map((issue: { message: string }) => ({
          code: "INVALID_REQUEST",
          stage: "validation",
          message: issue.message,
        })),
      });
    }

    const upstream = await adapter.search(parsed.data, { mode: "ground" });
    const normalized = normalizePrototypeResponse(parsed.data, upstream, "ground");
    return reply.send(normalized);
  });
}
