import { describe, expect, it, vi } from "vitest";
import { prepareCurrentPageContext } from "./image-sync.js";

describe("prepareCurrentPageContext", () => {
  const file = new File(["page"], "page-1.png", { type: "image/png" });

  it("uploads only the current page without saving it to the file library", async () => {
    const uploadFile = vi.fn().mockResolvedValue({
      file_id: "file-1",
      download_url: "https://example.test/file-1",
      mime_type: "image/png",
      file_name: "page-1.png"
    });

    const result = await prepareCurrentPageContext({
      file,
      pageDescription: "这一页男主在哭。",
      userNote: "这里好难过。",
      uploadFile
    });

    expect(uploadFile).toHaveBeenCalledWith(file);
    expect(result.syncMode).toBe("image");
    expect(result.currentPageImage?.file_id).toBe("file-1");
  });

  it("falls back to the page description when upload is unavailable", async () => {
    const result = await prepareCurrentPageContext({
      file,
      pageDescription: "这一页男主在哭。",
      userNote: "这里好难过。"
    });

    expect(result).toEqual({
      syncMode: "description",
      pageDescription: "这一页男主在哭。",
      userNote: "这里好难过。",
      warning: "当前环境暂不支持图片同步，可以先用页面描述让烁构共读。"
    });
  });
});
