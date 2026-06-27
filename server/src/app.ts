import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response } from "express";
import { createMcpServer } from "./mcp/create-server.js";

type TransportMap = Record<string, StreamableHTTPServerTransport>;

export function createApp() {
  const app = createMcpExpressApp();
  const transports: TransportMap = {};

  app.get("/health", (_request, response) => {
    response.json({ ok: true, app: "S×S 小窝共读", version: "0.2.1" });
  });

  app.post("/mcp", async (request: Request, response: Response) => {
    try {
      const sessionId = request.headers["mcp-session-id"] as string | undefined;
      let transport = sessionId ? transports[sessionId] : undefined;

      if (!transport && !sessionId && isInitializeRequest(request.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (createdSessionId) => {
            transports[createdSessionId] = transport!;
          }
        });
        transport.onclose = () => {
          if (transport?.sessionId) delete transports[transport.sessionId];
        };
        await (await createMcpServer()).connect(transport);
      }

      if (!transport) {
        response.status(400).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32000, message: "Invalid or missing MCP session ID" }
        });
        return;
      }
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: error instanceof Error ? error.message : "Internal error" }
        });
      }
    }
  });

  app.get("/mcp", async (request: Request, response: Response) => {
    const sessionId = request.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports[sessionId] : undefined;
    if (!transport) return response.status(400).send("Invalid or missing MCP session ID");
    await transport.handleRequest(request, response);
  });

  app.delete("/mcp", async (request: Request, response: Response) => {
    const sessionId = request.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports[sessionId] : undefined;
    if (!transport) return response.status(400).send("Invalid or missing MCP session ID");
    await transport.handleRequest(request, response);
  });

  return app;
}
