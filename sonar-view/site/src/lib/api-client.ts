const SETTINGS_KEY = "sonar-view-settings";

export function getApiBaseUrl(): string {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { viewServerUrl?: string } };
      return parsed.state?.viewServerUrl?.replace(/\/$/, "") || "http://localhost:8283";
    }
  } catch {
    // ignore
  }
  return "http://localhost:8283";
}

export function getWsUrl(): string {
  return getApiBaseUrl().replace(/^http/, "ws") + "/ws";
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status}: ${text || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
