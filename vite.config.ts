import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleApi } from "./server/api";

function apiPlugin(env: Record<string, string>): Plugin {
  const middleware = async (req: any, res: any, next: () => void) => {
    if (!req.url?.startsWith("/api/")) return next();
    try {
      const origin = `http://${req.headers.host || "localhost:5173"}`;
      const init: RequestInit & { duplex?: string } = {
        method: req.method,
        headers: req.headers,
      };
      if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = req;
        init.duplex = "half";
      }
      const response = await handleApi(
        new Request(new URL(req.url, origin), init),
        env,
      );
      if (!response) return next();
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "No se pudo procesar la consulta." }));
    }
  };
  return {
    name: "orbital-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    plugins: [react(), apiPlugin(env as Record<string, string>)],
    build: { outDir: "build/client", emptyOutDir: true },
    server: { host: "127.0.0.1", port: 5173 },
    preview: { host: "127.0.0.1", port: 4173 },
  };
});
