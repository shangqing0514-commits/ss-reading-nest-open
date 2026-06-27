import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Cloudflare Worker module boundary", () => {
  it("imports the Worker-safe MCP server factory", async () => {
    const workerSource = await readFile(new URL("./worker.ts", import.meta.url), "utf8");

    expect(workerSource).toContain("./mcp/server-factory.js");
    expect(workerSource).not.toContain("./mcp/create-server.js");
  });
});
