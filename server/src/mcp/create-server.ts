import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { JsonReadingRepository } from "../repositories/json-reading-repository.js";
import { createMcpServerFromRepository } from "./server-factory.js";

const widgetPath = fileURLToPath(new URL("../../../web/dist/index.html", import.meta.url));

export async function createMcpServer(dataFile = resolve("data", "sessions.json")) {
  const widgetHtml = await readFile(widgetPath, "utf8");
  return createMcpServerFromRepository(new JsonReadingRepository(dataFile), widgetHtml);
}
