import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(rootDir, "..");

const paths = [
  "apps/api/dist",
  "apps/cli/dist",
  "packages/core/dist",
  "packages/firecrawl-adapter/dist",
  "coverage"
];

await Promise.all(
  paths.map((relativePath) =>
    rm(path.join(repoDir, relativePath), { force: true, recursive: true })
  )
);
