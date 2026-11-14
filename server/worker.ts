import { handleApi, type Environment } from "./api";
import { assets, redirects } from "./generated-assets";

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const api = await handleApi(request, env);
    if (api) return api;
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", { status: 405 });
    if (redirects[pathname]) return Response.redirect(redirects[pathname], 302);
    const asset =
      assets[pathname] ||
      (!pathname.split("/").pop()?.includes(".")
        ? assets["/index.html"]
        : undefined);
    if (!asset) return new Response("Archivo no encontrado", { status: 404 });
    const bytes = Uint8Array.from(atob(asset.data), (char) =>
      char.charCodeAt(0),
    );
    const headers = new Headers({
      "Content-Type": asset.type,
      "Cache-Control": pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      Vary: "Accept-Encoding",
    });
    if (request.headers.get("accept-encoding")?.includes("gzip")) {
      headers.set("Content-Encoding", "gzip");
      return new Response(request.method === "HEAD" ? null : bytes, {
        headers,
      });
    }
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return new Response(request.method === "HEAD" ? null : stream, { headers });
  },
};
