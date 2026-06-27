import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadingRepository } from "../repositories/reading-repository.js";
import { ReadingService } from "../services/reading-service.js";
import type { CloudSourceService } from "../services/cloud-source-service.js";
import { registerReadingResource } from "./register-resource.js";
import { registerReadingTools } from "./register-tools.js";

export function createMcpServerFromRepository(
  repository: ReadingRepository,
  widgetHtml: string,
  cloudSourceService?: CloudSourceService,
  options: { sourceEndpointBase?: string; workerOrigin?: string } = {}
) {
  const server = new McpServer({
    name: "S×S 小窝共读",
    version: "0.2.1"
  });
  const service = new ReadingService(repository);
  registerReadingResource(server, widgetHtml, options.workerOrigin);
  registerReadingTools(server, service, cloudSourceService, options);
  return server;
}
