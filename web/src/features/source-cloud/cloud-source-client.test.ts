import { describe, expect, it, vi } from "vitest";
import { CloudSourceClient } from "./cloud-source-client.js";

describe("CloudSourceClient", () => {
  it("uploads novel source through the app bridge tool when available", async () => {
    const fetchMock = vi.fn();
    const sourceManifest = {
      sourceId: "source-bridge",
      sourceKind: "pasted_text" as const,
      contentHash: "c".repeat(64),
      segmentationVersion: 1,
      paragraphCount: 1,
      cloudSync: {
        enabled: true,
        provider: "r2" as const,
        objectKey: "private/sources/source-bridge/source.txt"
      }
    };
    const toolCaller = vi.fn().mockResolvedValue({
      structuredContent: {
        uploaded: true,
        sessionId: "session-1",
        sourceId: "source-bridge",
        contentHash: "c".repeat(64),
        paragraphCount: 1,
        cloudSync: { enabled: true, provider: "r2" }
      },
      _meta: { sourceManifest }
    });
    const client = new CloudSourceClient("/source/secret", fetchMock, toolCaller);

    const result = await client.uploadNovelSource({
      sessionId: "session-1",
      title: "Bridge book",
      sourceText: "private novel text"
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(toolCaller).toHaveBeenCalledWith("upload_cloud_source", {
      sessionId: "session-1",
      sourceKind: "pasted_text",
      title: "Bridge book",
      sourceText: "private novel text"
    });
    expect(result.sourceManifest).toBe(sourceManifest);
    expect(JSON.stringify(toolCaller.mock.results)).not.toContain("private novel text");
  });

  it("uploads novel source to the component-only endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        sourceManifest: {
          sourceId: "source-1",
          sourceKind: "pasted_text",
          contentHash: "a".repeat(64),
          segmentationVersion: 1,
          paragraphCount: 2,
          cloudSync: { enabled: true, provider: "r2", objectKey: "private/sources/source-1/source.txt" }
        }
      })
    );
    const client = new CloudSourceClient("/source/secret", fetchMock);

    const result = await client.uploadNovelSource({
      sessionId: "session-1",
      title: "测试书",
      sourceText: "第一段\n\n第二段"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/source/secret/upload",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      sessionId: "session-1",
      title: "测试书",
      sourceText: "第一段\n\n第二段"
    });
    expect(result.sourceManifest?.sourceId).toBe("source-1");
    expect(result).not.toHaveProperty("sourceText");
  });

  it("restores novel source from the component-only endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        sourceText: "第一段\n\n第二段",
        sourceManifest: {
          sourceId: "source-1",
          sourceKind: "pasted_text",
          contentHash: "a".repeat(64),
          segmentationVersion: 1,
          paragraphCount: 2,
          cloudSync: { enabled: true, provider: "r2", objectKey: "private/sources/source-1/source.txt" }
        }
      })
    );
    const client = new CloudSourceClient("/source/secret", fetchMock);

    const result = await client.restoreNovelSource({ sessionId: "session-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/source/secret/restore",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.sourceText).toBe("第一段\n\n第二段");
    expect(result).not.toHaveProperty("publicUrl");
    expect(result).not.toHaveProperty("signedUrl");
  });

  it("throws clear errors for HTTP failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "云端正文不可用" }, 400));
    const client = new CloudSourceClient("/source/secret", fetchMock);

    await expect(client.restoreNovelSource({ sessionId: "session-1" })).rejects.toThrow(
      "云端正文不可用"
    );
  });

  it("returns a diagnostic failure when the browser blocks the source request before a response", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const client = new CloudSourceClient("https://worker.example.test/source/secret", fetchMock);

    const result = await client.uploadNovelSource({
      sessionId: "session-1",
      sourceText: "第一段"
    });

    expect(result.sourceManifest).toBeUndefined();
    expect(result.diagnostics).toMatchObject({
      bridgeToolAvailable: false,
      bridgeUploadStarted: false,
      bridgeUploadStatus: "not_started",
      directUploadStarted: true,
      directUploadStatus: "failure"
    });
    expect(result.diagnostics.directUploadError).toContain("云端正文请求未到达服务器");
  });

  it("includes safe app and upload diagnostics when fetch is blocked", async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      new TypeError("Failed to fetch /source/secret/upload with private/sources/source-1/source.txt")
    );
    const client = new CloudSourceClient("https://worker.example.test/source/secret", fetchMock);

    const result = await client.uploadNovelSource({
      sessionId: "session-1",
      sourceText: "private novel text"
    });
    const message = result.diagnostics.directUploadError ?? "";

    expect(message).toContain("resourceVersion=app-v8");
    expect(message).toContain("appVersion=0.2.2");
    expect(message).toContain("sourceEndpointBase=present");
    expect(message).toContain("uploadOrigin=https://worker.example.test");
    expect(message).toContain("uploadPath=/source/<token>/upload");
    expect(message).toContain("fetchError=TypeError");
    expect(message).toContain("likelyBrowserBlock=yes");
    expect(message).not.toContain("secret");
    expect(message).not.toContain("private novel text");
    expect(message).not.toContain("private/sources/source-1");
  });

  it("does not fall back to direct fetch after bridge upload succeeds without private metadata", async () => {
    const fetchMock = vi.fn();
    const toolCaller = vi.fn().mockResolvedValue({
      structuredContent: {
        uploaded: true,
        sessionId: "session-1",
        sourceId: "source-bridge",
        contentHash: "c".repeat(64),
        paragraphCount: 1,
        cloudSync: { enabled: true, provider: "r2" }
      }
    });
    const client = new CloudSourceClient("https://worker.example.test/source/secret", fetchMock, toolCaller);

    const result = await client.uploadNovelSource({
      sessionId: "session-1",
      sourceText: "private novel text"
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.sourceManifest).toBeUndefined();
    expect(result.diagnostics).toMatchObject({
      bridgeToolAvailable: true,
      bridgeUploadStarted: true,
      bridgeUploadStatus: "success",
      returnedCloudSyncEnabled: false,
      directUploadStarted: false,
      directUploadStatus: "not_started"
    });
  });

  it("uploads manga pages to the component-only endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        sourceManifest: {
          sourceId: "source-manga",
          sourceKind: "manga_import",
          contentHash: "b".repeat(64),
          segmentationVersion: 1,
          pageCount: 2,
          cloudSync: {
            enabled: true,
            provider: "r2",
            pages: [
              {
                index: 1,
                objectKey: "private/sources/source-manga/pages/1.png",
                contentHash: "c".repeat(64),
                mimeType: "image/png",
                sizeBytes: 3
              }
            ]
          }
        }
      })
    );
    const client = new CloudSourceClient("/source/secret", fetchMock);

    const result = await client.uploadMangaSource({
      sessionId: "session-1",
      title: "漫画书",
      pages: [
        { index: 1, blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), fileName: "001.png" }
      ]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/source/secret/upload",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      sessionId: "session-1",
      sourceKind: "manga_import",
      pages: [{ index: 1, bytesBase64: "AQID", mimeType: "image/png", fileName: "001.png" }]
    });
    expect(JSON.stringify(result)).not.toMatch(/AQID|data:image|publicUrl|signedUrl/);
  });

  it("restores one manga page from the component-only endpoint as a blob", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        pageIndex: 1,
        bytesBase64: "AQID",
        mimeType: "image/png",
        page: {
          index: 1,
          objectKey: "private/sources/source-manga/pages/1.png",
          contentHash: "c".repeat(64),
          mimeType: "image/png",
          sizeBytes: 3
        }
      })
    );
    const client = new CloudSourceClient("/source/secret", fetchMock);

    const result = await client.restoreMangaPage({ sessionId: "session-1", pageIndex: 1 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/source/secret/restore",
      expect.objectContaining({ method: "POST" })
    );
    expect(await result.blob.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect(result.blob.type).toBe("image/png");
    expect(result.page.index).toBe(1);
    expect(result).not.toHaveProperty("structuredContent");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
