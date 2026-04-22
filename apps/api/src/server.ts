import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { env } from "./lib/env.js";
import { registerCapabilitiesRoute } from "./routes/capabilities.js";
import { registerGroundRoute } from "./routes/ground.js";
import { registerSearchRoute } from "./routes/search.js";

const app = Fastify({
  logger: {
    level: "info",
  },
});

await app.register(cors, { origin: true });
await app.register(sensible);

app.get("/health", async () => ({
  status: "ok",
  service: "firecrawl-search-prototype",
  timestamp: new Date().toISOString(),
}));

await registerSearchRoute(app);
await registerGroundRoute(app);
await registerCapabilitiesRoute(app);

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const message = error instanceof Error ? error.message : "Unknown server error";
  reply.status(500).send({
    requestId: crypto.randomUUID(),
    outcome: {
      code: "UNKNOWN_ERROR",
      message: "The prototype wrapper hit an unexpected error.",
    },
    partial: false,
    results: [],
    diagnostics: {
      normalizedQuery: "",
      requestedLimit: 0,
      returnedCount: 0,
      filteredCount: 0,
      durationMs: 0,
      sourceMode: "search",
    },
    credits: {
      estimated: 0,
      used: 0,
      currency: "credits",
    },
    errors: [
      {
        code: "UNKNOWN_ERROR",
        stage: "server",
        message,
      },
    ],
  });
});

await app.listen({ host: "0.0.0.0", port: env.PROTOTYPE_PORT });
app.log.info(`Prototype API listening on port ${env.PROTOTYPE_PORT}`);
