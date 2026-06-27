import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION_PREFERENCES, type ReadingDatabase } from "@ss/shared";
import type { ReadingRepository } from "./repositories/reading-repository.js";
import { MemorySourceObjectStorage } from "./storage/memory-source-object-storage.js";
import { CloudSourceService } from "./services/cloud-source-service.js";
import { handleSourceRoute } from "./source-routes.js";

const NOW = "2026-06-24T00:00:00.000Z";

describe("handleSourceRoute", () => {
  it("allows browser component preflight and adds CORS headers to source responses", async () => {
    const { service } = setup();
    const preflight = await handleSourceRoute(
      new Request("https://example.test/source/secret/upload", {
        method: "OPTIONS",
        headers: {
          origin: "https://chatgpt.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type"
        }
      }),
      service
    );

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("content-type");

    const upload = await handleSourceRoute(
      new Request("https://example.test/source/secret/upload", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          sourceKind: "pasted_text",
          sourceText: "第一段\n\n第二段"
        })
      }),
      service
    );
    expect(upload.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("uploads novel source through a component-only response with metadata only", async () => {
    const { service, repository } = setup();
    const response = await handleSourceRoute(
      new Request("https://example.test/source/secret/upload", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          sourceKind: "pasted_text",
          title: "测试书",
          sourceText: "第一段\n\n第二段"
        })
      }),
      service
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("sourceManifest");
    expect(JSON.stringify(body)).not.toMatch(/sourceText|publicUrl|signedUrl|structuredContent/);
    expect(JSON.stringify(await repository.read())).not.toContain("第一段");
  });

  it("restores novel source for the component without returning an MCP tool result", async () => {
    const { service } = setup();
    await service.uploadNovelSource({
      sessionId: "session-1",
      sourceKind: "pasted_text",
      title: "测试书",
      sourceText: "第一段\n\n第二段"
    });

    const response = await handleSourceRoute(
      new Request("https://example.test/source/secret/restore", {
        method: "POST",
        body: JSON.stringify({ sessionId: "session-1" })
      }),
      service
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.sourceText).toBe("第一段\n\n第二段");
    expect(body).toHaveProperty("sourceManifest");
    expect(body).not.toHaveProperty("structuredContent");
    expect(body).not.toHaveProperty("content");
  });

  it("returns safe errors for disabled or missing cloud source", async () => {
    const { service, storage } = setup();
    const disabled = await handleSourceRoute(
      new Request("https://example.test/source/secret/restore", {
        method: "POST",
        body: JSON.stringify({ sessionId: "session-1" })
      }),
      service
    );
    expect(disabled.status).toBe(400);
    expect(await disabled.text()).not.toContain("sourceText");

    const uploaded = await service.uploadNovelSource({
      sessionId: "session-1",
      sourceKind: "pasted_text",
      title: "测试书",
      sourceText: "第一段\n\n第二段"
    });
    await storage.deleteObject(uploaded.sourceManifest.cloudSync.objectKey!);
    const missing = await handleSourceRoute(
      new Request("https://example.test/source/secret/restore", {
        method: "POST",
        body: JSON.stringify({ sessionId: "session-1" })
      }),
      service
    );
    expect(missing.status).toBe(400);
    expect(await missing.text()).not.toContain("第一段");
  });

  it("rejects unsupported source routes without leaking details", async () => {
    const { service } = setup();
    const response = await handleSourceRoute(
      new Request("https://example.test/source/secret/unknown", { method: "POST" }),
      service
    );

    expect(response.status).toBe(404);
    expect(await response.text()).not.toMatch(/objectKey|secret|sourceText/);
  });

  it("uploads manga pages through a component-only metadata response", async () => {
    const { service, repository } = setup();
    const response = await handleSourceRoute(
      new Request("https://example.test/source/secret/upload", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          sourceKind: "manga_import",
          title: "漫画书",
          pages: [
            { index: 1, bytesBase64: "AQID", mimeType: "image/png", fileName: "001.png" },
            { index: 2, bytesBase64: "BAUG", mimeType: "image/jpeg", fileName: "002.jpg" }
          ]
        })
      }),
      service
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body.sourceManifest).toMatchObject({
      sourceKind: "manga_import",
      pageCount: 2,
      cloudSync: {
        enabled: true,
        pages: [{ index: 1 }, { index: 2 }]
      }
    });
    expect(JSON.stringify(body)).not.toMatch(/AQID|BAUG|data:image|structuredContent|publicUrl|signedUrl/);
    expect(JSON.stringify(await repository.read())).not.toMatch(/AQID|BAUG|data:image|bytesBase64/);
  });

  it("restores one manga page for the component without returning an MCP tool result", async () => {
    const { service } = setup();
    await service.uploadMangaSource({
      sessionId: "session-1",
      title: "漫画书",
      pages: [{ index: 1, bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" }]
    });

    const response = await handleSourceRoute(
      new Request("https://example.test/source/secret/restore", {
        method: "POST",
        body: JSON.stringify({ sessionId: "session-1", sourceKind: "manga_import", pageIndex: 1 })
      }),
      service
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      pageIndex: 1,
      mimeType: "image/png",
      bytesBase64: "AQID"
    });
    expect(body).toHaveProperty("page");
    expect(body).not.toHaveProperty("structuredContent");
    expect(JSON.stringify(body)).not.toMatch(/publicUrl|signedUrl|data:image/);
  });
});

function setup() {
  const repository = new MemoryReadingRepository();
  const storage = new MemorySourceObjectStorage();
  const service = new CloudSourceService(repository, storage, {
    now: () => new Date(NOW),
    id: () => "source-1"
  });
  return { repository, service, storage };
}

class MemoryReadingRepository implements ReadingRepository {
  private database: ReadingDatabase = {
    schemaVersion: 4,
    sessions: [
      {
        id: "session-1",
        title: "测试书",
        type: "novel",
        status: "active",
        userCurrentPosition: { kind: "paragraph", index: 1, label: "第 1 段" },
        assistantSyncedPosition: null,
        liveReadingEnabled: false,
        sessionPreferences: structuredClone(DEFAULT_SESSION_PREFERENCES),
        sourceManifest: null,
        createdAt: NOW,
        updatedAt: NOW,
        lastReadAt: NOW
      }
    ],
    quotes: [],
    reactions: [],
    bookmarks: [],
    companionComments: []
  };

  async read(): Promise<ReadingDatabase> {
    return structuredClone(this.database);
  }

  async mutate<T>(change: (database: ReadingDatabase) => T | Promise<T>): Promise<T> {
    return change(this.database);
  }
}
