import { context } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PROTOTYPE_WEB_PORT ?? "4173");

const ctx = await context({
  entryPoints: [path.join(root, "src/main.ts")],
  bundle: true,
  format: "esm",
  outfile: path.join(root, "dist/main.js"),
  target: "es2022",
  sourcemap: true,
  loader: {
    ".css": "css",
  },
});

await ctx.watch();
const server = await ctx.serve({
  servedir: root,
  port,
});

console.log(`Prototype web UI available at http://${server.host}:${server.port}`);
