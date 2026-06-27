export type WorkerRoute = "health" | "mcp" | "source" | "not-found" | "misconfigured";

export function getWorkerRoute(url: URL, token: string | undefined): WorkerRoute {
  if (url.pathname === "/health") return "health";
  if (!token) return "misconfigured";
  if (
    url.pathname === `/source/${token}/upload` ||
    url.pathname === `/source/${token}/restore`
  ) {
    return "source";
  }
  return url.pathname === `/mcp/${token}` ? "mcp" : "not-found";
}
