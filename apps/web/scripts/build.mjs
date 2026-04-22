import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outdir = path.join(root, "dist");

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [path.join(root, "src/main.ts")],
  bundle: true,
  format: "esm",
  outfile: path.join(outdir, "main.js"),
  target: "es2022",
  sourcemap: true,
  loader: {
    ".css": "css",
  },
});

const html = await readFile(path.join(root, "index.html"), "utf8");
const builtHtml = html
  .replaceAll("./dist/main.css", "./main.css")
  .replaceAll("./dist/main.js", "./main.js");
await writeFile(path.join(outdir, "index.html"), builtHtml, "utf8");
