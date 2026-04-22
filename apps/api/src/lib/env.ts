import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  FIRECRAWL_API_KEY: z.string().optional(),
  FIRECRAWL_BASE_URL: z.string().url().default("https://api.firecrawl.dev"),
  PROTOTYPE_PORT: z.coerce.number().int().positive().default(3000),
  PROTOTYPE_USE_FIXTURES: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  PROTOTYPE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

export const env = envSchema.parse(process.env);

export function shouldUseFixtures(): boolean {
  return env.PROTOTYPE_USE_FIXTURES || !env.FIRECRAWL_API_KEY;
}

