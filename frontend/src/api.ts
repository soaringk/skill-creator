const apiBase = import.meta.env.BASE_URL;

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${apiBase}${normalizedPath}`;
}

export function wsUrl(path: string): string {
  const url = new URL(apiUrl(path), window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const response = await fetch(apiUrl(path), { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(errorMessage(text, response.status));
  }
  return (await response.json()) as T;
}

export function errorMessage(body: string, status: number): string {
  if (!body) return `Request failed: ${status}`;
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // Keep the original response body.
  }
  return body;
}
