import { RateLimiter } from "./rate-limit.js";

export interface AuthConfig {
  type: "none" | "api-key" | "bearer" | "custom";
  envVar?: string;
  headerName?: string;
}

export interface ApiFetcherConfig {
  baseUrl: string;
  auth: AuthConfig;
  rateLimit: number;
}

export interface ApiFetcher {
  get<T = unknown>(path: string, params?: Record<string, string>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

function buildAuthHeaders(auth: AuthConfig): Record<string, string> {
  if (auth.type === "none") return {};

  const key = auth.envVar ? process.env[auth.envVar] : undefined;
  if (!key) {
    console.error(`Warning: ${auth.envVar} not set, requests will be unauthenticated`);
    return {};
  }

  switch (auth.type) {
    case "api-key":
      return { [auth.headerName || "X-Api-Key"]: key };
    case "bearer":
      return { Authorization: `Bearer ${key}` };
    case "custom":
      return { [auth.headerName || "X-Custom-Auth"]: key };
    default:
      return {};
  }
}

export function createApiFetcher(config: ApiFetcherConfig): ApiFetcher {
  const limiter = new RateLimiter(config.rateLimit);
  const base = config.baseUrl.replace(/\/+$/, "");

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await limiter.acquire();

    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...buildAuthHeaders(config.auth),
    };

    const init: RequestInit = { method, headers };
    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} — ${await response.text()}`);
    }

    return (await response.json()) as T;
  }

  return {
    async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
      let fullPath = path;
      if (params) {
        const qs = new URLSearchParams(params).toString();
        fullPath = `${path}?${qs}`;
      }
      return request<T>("GET", fullPath);
    },
    async post<T = unknown>(path: string, body?: unknown): Promise<T> {
      return request<T>("POST", path, body);
    },
    async put<T = unknown>(path: string, body?: unknown): Promise<T> {
      return request<T>("PUT", path, body);
    },
    async delete<T = unknown>(path: string): Promise<T> {
      return request<T>("DELETE", path);
    },
  };
}
