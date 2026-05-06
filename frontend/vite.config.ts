import { defineConfig, loadEnv } from "vite";
import path from "node:path";

function normalizeBasePath(value: string | undefined): string {
  if (!value) return "/";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig(({ mode }) => {
  const frontendEnv = loadEnv(mode, process.cwd(), "");
  const rootEnv = loadEnv(mode, path.resolve(process.cwd(), ".."), "");
  const env = { ...rootEnv, ...frontendEnv, ...process.env };
  const base = normalizeBasePath(env.VITE_BASE_PATH);
  const basePrefix = base === "/" ? "" : base.slice(0, -1);
  const apiProxyPath = `${basePrefix}/api`;

  const proxyConfig = {
    [apiProxyPath]: {
      target: "http://127.0.0.1:8010",
      changeOrigin: true,
      ws: true,
      rewrite: (requestPath: string) =>
        basePrefix ? requestPath.slice(basePrefix.length) : requestPath
    }
  };

  return {
    base,
    server: {
      allowedHosts: ["kefan.life", "www.kefan.life"],
      proxy: proxyConfig
    },
    preview: {
      allowedHosts: ["kefan.life", "www.kefan.life"],
      proxy: proxyConfig
    }
  };
});
