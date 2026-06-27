import { AppError } from "./errors/app-error.js";
import type { CloudSourceService } from "./services/cloud-source-service.js";

export async function handleSourceRoute(
  request: Request,
  service: CloudSourceService
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== "POST") return new Response("Not found", { status: 404, headers: corsHeaders() });

  try {
    if (url.pathname.endsWith("/upload")) {
      const input = await readJson(request);
      const sourceKind = readSourceKind(input);
      const sourceShape =
        sourceKind === "manga_import"
          ? { pageCount: Array.isArray(input.pages) ? input.pages.length : 0 }
          : { paragraphCount: countParagraphs(typeof input.sourceText === "string" ? input.sourceText : "") };
      const common = {
        sessionId: readString(input, "sessionId"),
        ...(typeof input.title === "string" && input.title.trim()
          ? { title: input.title.trim() }
          : {})
      };
      const result =
        sourceKind === "manga_import"
          ? await service.uploadMangaSource({
              ...common,
              pages: readMangaPages(input)
            })
          : await service.uploadNovelSource({
              ...common,
              sourceKind,
              sourceText: readString(input, "sourceText")
            });
      logSourceRoute({ route: "upload", sourceKind, status: 200, ...sourceShape });
      return json(result);
    }
    if (url.pathname.endsWith("/restore")) {
      const input = await readJson(request);
      if (input.sourceKind === "manga_import" || input.pageIndex !== undefined) {
        const result = await service.restoreMangaPage(
          readString(input, "sessionId"),
          readPageIndex(input)
        );
        return json({
          pageIndex: result.page.index,
          bytesBase64: arrayBufferToBase64(result.bytes),
          mimeType: result.mimeType,
          page: result.page,
          sourceManifest: result.sourceManifest
        });
      }
      return json(await service.restoreNovelSource(readString(input, "sessionId")));
    }
    return new Response("Not found", { status: 404, headers: corsHeaders() });
  } catch (error) {
    logSourceRoute({
      route: url.pathname.endsWith("/upload") ? "upload" : url.pathname.endsWith("/restore") ? "restore" : "unknown",
      status: error instanceof AppError ? 400 : 500,
      errorCode: error instanceof AppError ? error.code : "UNEXPECTED"
    });
    if (error instanceof AppError) {
      return json({ error: error.message }, 400);
    }
    return json({ error: "Source request failed" }, 500);
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const value = (await request.json()) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("INVALID_OPERATION", "请求格式无效。");
  }
  return value as Record<string, unknown>;
}

function readString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError("INVALID_OPERATION", "请求缺少必要字段。");
  }
  return value;
}

function readSourceKind(input: Record<string, unknown>): "pasted_text" | "file_import" | "manga_import" {
  const value = input.sourceKind;
  if (value === "pasted_text" || value === "file_import") return value;
  if (value === "manga_import") return value;
  throw new AppError("INVALID_OPERATION", "暂时只支持小说正文或漫画图片云端同步。");
}

function readMangaPages(input: Record<string, unknown>): Array<{
  index: number;
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}> {
  const pages = input.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new AppError("INVALID_OPERATION", "请求缺少漫画页。");
  }
  return pages.map((page) => {
    if (!page || typeof page !== "object" || Array.isArray(page)) {
      throw new AppError("INVALID_OPERATION", "漫画页格式无效。");
    }
    const value = page as Record<string, unknown>;
    const index = value.index;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 1) {
      throw new AppError("INVALID_OPERATION", "漫画页码无效。");
    }
    return {
      index,
      bytes: base64ToBytes(readString(value, "bytesBase64")),
      mimeType: readString(value, "mimeType"),
      ...(typeof value.fileName === "string" && value.fileName ? { fileName: value.fileName } : {})
    };
  });
}

function readPageIndex(input: Record<string, unknown>): number {
  const pageIndex = input.pageIndex;
  if (typeof pageIndex !== "number" || !Number.isInteger(pageIndex) || pageIndex < 1) {
    throw new AppError("INVALID_OPERATION", "漫画页码无效。");
  }
  return pageIndex;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function arrayBufferToBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function countParagraphs(sourceText: string): number {
  return sourceText
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean).length;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders() });
}

function corsHeaders(): HeadersInit {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  };
}

function logSourceRoute(event: Record<string, unknown>) {
  console.log(JSON.stringify({ component: "source-route", ...event }));
}
