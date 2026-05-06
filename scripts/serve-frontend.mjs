import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = 5173;
const basePath = "/tools/skill-creator";
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const root = join(projectRoot, "frontend", "dist");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"]
]);

function resolvePath(url) {
  const parsed = new URL(url, `http://${host}:${port}`);
  let path = decodeURIComponent(parsed.pathname);
  if (!path.startsWith(basePath)) return null;
  path = path.slice(basePath.length) || "/";
  if (path === "/") path = "/index.html";

  const candidate = normalize(join(root, path));
  if (!candidate.startsWith(root)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return join(root, "index.html");
}

const server = createServer((request, response) => {
  const filePath = resolvePath(request.url || "/");
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const type = contentTypes.get(extname(filePath)) || "application/octet-stream";
  const headers = {
    "Content-Type": type,
    "Cache-Control": filePath.includes("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache"
  };
  response.writeHead(200, headers);
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Skill Creator frontend serving ${root} at http://${host}:${port}${basePath}/`);
});
