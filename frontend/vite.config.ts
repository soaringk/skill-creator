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
  const devPrefix = base === "/" ? "" : base.slice(0, -1);

  return {
    base,
    server: {
      proxy: {
        [`${devPrefix}/api`]: {
          target: "http://127.0.0.1:8010",
          changeOrigin: true,
          rewrite: (path) => (devPrefix ? path.slice(devPrefix.length) : path)
        }
      }
    }
  };
});
