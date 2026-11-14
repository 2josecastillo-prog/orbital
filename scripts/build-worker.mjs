import { build } from "esbuild";
import {
  readFile,
  writeFile,
  readdir,
  mkdir,
  copyFile,
} from "node:fs/promises";
import { resolve, relative, extname, join } from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const client = resolve(root, "build/client");
const assets = {};
const redirects = {};
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".mp4": "video/mp4",
};
let manifest = [];
try {
  manifest = JSON.parse(
    await readFile(resolve(root, "public/resources/manifest.json"), "utf8"),
  );
} catch {}
const entries = Array.isArray(manifest) ? manifest : manifest.resources || [];
for (const resource of entries) {
  if (
    resource.bytes > 1_000_000 &&
    resource.sourceUrl?.startsWith("https://")
  ) {
    redirects[resource.path] = resource.sourceUrl;
  }
}

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(file);
      continue;
    }
    const path = "/" + relative(client, file).replaceAll("\\", "/");
    const bytes = await readFile(file);
    const resource = entries.find((item) => item.path === path);
    if (
      bytes.byteLength > 1_000_000 &&
      resource?.sourceUrl?.startsWith("https://")
    ) {
      redirects[path] = resource.sourceUrl;
      continue;
    }
    assets[path] = {
      type: types[extname(file)] || "application/octet-stream",
      data: gzipSync(bytes, { level: 9 }).toString("base64"),
    };
  }
}

await collect(client);
if (!assets["/index.html"])
  throw new Error("Vite build missing build/client/index.html");
await mkdir(resolve(root, "server"), { recursive: true });
await writeFile(
  resolve(root, "server/generated-assets.ts"),
  `export const assets: Record<string, {type:string;data:string}> = ${JSON.stringify(assets)};\nexport const redirects: Record<string,string> = ${JSON.stringify(redirects)};\n`,
);
await mkdir(resolve(root, "dist/server"), { recursive: true });
await mkdir(resolve(root, "dist/.openai"), { recursive: true });
await build({
  entryPoints: [resolve(root, "server/worker.ts")],
  outfile: resolve(root, "dist/server/index.js"),
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
await copyFile(
  resolve(root, ".openai/hosting.json"),
  resolve(root, "dist/.openai/hosting.json"),
);
const output = await readFile(resolve(root, "dist/server/index.js"));
console.log(
  `Worker ready: ${(output.byteLength / 1_000_000).toFixed(2)} MB, ${Object.keys(assets).length} embedded assets, ${Object.keys(redirects).length} original-source redirects.`,
);
