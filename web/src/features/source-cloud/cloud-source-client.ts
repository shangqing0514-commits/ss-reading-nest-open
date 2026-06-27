import type { CloudSourcePage, SourceManifest } from "@ss/shared";
import type { ToolCallResult } from "../../types/openai.js";

type FetchLike = typeof fetch;
type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
export type CloudUploadStatus = "not_started" | "success" | "failure";
export interface CloudUploadDiagnostics {
  bridgeToolAvailable: boolean;
  bridgeUploadStarted: boolean;
  bridgeUploadStatus: CloudUploadStatus;
  bridgeUploadError?: string;
  returnedCloudSyncEnabled?: boolean;
  directUploadStarted: boolean;
  directUploadStatus: CloudUploadStatus;
  directUploadError?: string;
}

export interface CloudSourceUploadResult {
  sourceManifest?: SourceManifest;
  diagnostics: CloudUploadDiagnostics;
}

const RESOURCE_VERSION = "app-v8";
const APP_VERSION = "0.2.2";

export class CloudSourceClient {
  constructor(
    private readonly endpointBase: string,
    private readonly fetchFn: FetchLike = fetch.bind(window),
    private readonly toolCaller?: ToolCaller
  ) {}

  async uploadNovelSource(input: {
    sessionId: string;
    title?: string;
    sourceText: string;
  }): Promise<CloudSourceUploadResult> {
    if (this.toolCaller) {
      return this.uploadViaTool({
        sessionId: input.sessionId,
        sourceKind: "pasted_text",
        ...(input.title ? { title: input.title } : {}),
        sourceText: input.sourceText
      });
    }
    return this.uploadViaDirect({
      sessionId: input.sessionId,
      sourceKind: "pasted_text",
      ...(input.title ? { title: input.title } : {}),
      sourceText: input.sourceText
    });
  }

  async restoreNovelSource(input: {
    sessionId: string;
  }): Promise<{ sourceText: string; sourceManifest: SourceManifest }> {
    return this.post<{ sourceText: string; sourceManifest: SourceManifest }>("/restore", {
      sessionId: input.sessionId
    });
  }

  async uploadMangaSource(input: {
    sessionId: string;
    title?: string;
    pages: Array<{
      index: number;
      blob: Blob;
      fileName?: string;
    }>;
  }): Promise<CloudSourceUploadResult> {
    const pages = await Promise.all(
      input.pages.map(async (page) => ({
        index: page.index,
        bytesBase64: arrayBufferToBase64(await page.blob.arrayBuffer()),
        mimeType: page.blob.type || "application/octet-stream",
        ...(page.fileName ? { fileName: page.fileName } : {})
      }))
    );
    if (this.toolCaller) {
      return this.uploadViaTool({
        sessionId: input.sessionId,
        sourceKind: "manga_import",
        ...(input.title ? { title: input.title } : {}),
        pages
      });
    }
    return this.uploadViaDirect({
      sessionId: input.sessionId,
      sourceKind: "manga_import",
      ...(input.title ? { title: input.title } : {}),
      pages
    });
  }

  async restoreMangaPage(input: {
    sessionId: string;
    pageIndex: number;
  }): Promise<{
    pageIndex: number;
    blob: Blob;
    page: CloudSourcePage;
    sourceManifest?: SourceManifest;
  }> {
    const payload = await this.post<{
      pageIndex: number;
      bytesBase64: string;
      mimeType: string;
      page: CloudSourcePage;
      sourceManifest?: SourceManifest;
    }>("/restore", {
      sessionId: input.sessionId,
      sourceKind: "manga_import",
      pageIndex: input.pageIndex
    });
    return {
      pageIndex: payload.pageIndex,
      blob: new Blob([base64ToArrayBuffer(payload.bytesBase64)], { type: payload.mimeType }),
      page: payload.page,
      ...(payload.sourceManifest ? { sourceManifest: payload.sourceManifest } : {})
    };
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const uploadUrl = `${this.endpointBase}${path}`;
    let response: Response;
    try {
      response = await this.fetchFn(uploadUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw new Error(buildFetchBlockedMessage(uploadUrl, error));
    }
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? `云端正文请求失败（HTTP ${response.status}）`);
    }
    return payload as T;
  }

  private async uploadViaTool(input: Record<string, unknown>): Promise<CloudSourceUploadResult> {
    try {
      const result = await this.toolCaller!("upload_cloud_source", input);
      const sourceManifest =
        (result._meta?.sourceManifest as SourceManifest | undefined) ??
        (result.structuredContent?.sourceManifest as SourceManifest | undefined);
      return {
        ...(sourceManifest ? { sourceManifest } : {}),
        diagnostics: {
          bridgeToolAvailable: true,
          bridgeUploadStarted: true,
          bridgeUploadStatus: "success",
          returnedCloudSyncEnabled: sourceManifest?.cloudSync?.enabled === true,
          directUploadStarted: false,
          directUploadStatus: "not_started"
        }
      };
    } catch (error) {
      return {
        diagnostics: {
          bridgeToolAvailable: true,
          bridgeUploadStarted: true,
          bridgeUploadStatus: "failure",
          bridgeUploadError: sanitizeDiagnostic(error instanceof Error ? error.message : String(error)),
          directUploadStarted: false,
          directUploadStatus: "not_started"
        }
      };
    }
  }

  private async uploadViaDirect(input: Record<string, unknown>): Promise<CloudSourceUploadResult> {
    try {
      const result = await this.post<{ sourceManifest: SourceManifest }>("/upload", input);
      return {
        sourceManifest: result.sourceManifest,
        diagnostics: {
          bridgeToolAvailable: false,
          bridgeUploadStarted: false,
          bridgeUploadStatus: "not_started",
          returnedCloudSyncEnabled: result.sourceManifest?.cloudSync?.enabled === true,
          directUploadStarted: true,
          directUploadStatus: "success"
        }
      };
    } catch (error) {
      return {
        diagnostics: {
          bridgeToolAvailable: false,
          bridgeUploadStarted: false,
          bridgeUploadStatus: "not_started",
          directUploadStarted: true,
          directUploadStatus: "failure",
          directUploadError: sanitizeDiagnostic(error instanceof Error ? error.message : String(error), 1_000)
        }
      };
    }
  }
}

function buildFetchBlockedMessage(uploadUrl: string, error: unknown): string {
  const urlInfo = describeUploadUrl(uploadUrl);
  const errorName = error instanceof Error ? error.name : typeof error;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const likelyBrowserBlock =
    errorName === "TypeError" ||
    /failed to fetch|load failed|networkerror|csp|content security/i.test(errorMessage);
  return [
    "云端正文请求未到达服务器",
    `resourceVersion=${RESOURCE_VERSION}`,
    `appVersion=${APP_VERSION}`,
    `sourceEndpointBase=${uploadUrl ? "present" : "missing"}`,
    `uploadOrigin=${urlInfo.origin}`,
    `uploadPath=${urlInfo.path}`,
    `fetchError=${sanitizeDiagnostic(errorName)}:${sanitizeDiagnostic(errorMessage)}`,
    `likelyBrowserBlock=${likelyBrowserBlock ? "yes" : "unknown"}`,
    "可能被 CSP、浏览器安全策略或网络拦截"
  ].join("；");
}

function describeUploadUrl(uploadUrl: string) {
  try {
    const url = new URL(uploadUrl, window.location.href);
    return {
      origin: url.origin,
      path: maskSourcePath(url.pathname)
    };
  } catch {
    return {
      origin: "unknown",
      path: maskSourcePath(uploadUrl)
    };
  }
}

function maskSourcePath(value: string): string {
  return value
    .replace(/\/mcp\/[^/\s"'<>]+/g, "/mcp/<token>")
    .replace(/\/source\/[^/\s"'<>]+/g, "/source/<token>");
}

function sanitizeDiagnostic(value: string, maxLength = 140): string {
  return maskSourcePath(value)
    .replace(/private\/sources\/[^/\s"'<>]+/g, "private/sources/<sourceId>")
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/g, "data:image/<redacted>")
    .slice(0, maxLength);
}

function arrayBufferToBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}
