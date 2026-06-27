import { describe, expect, it } from "vitest";
import { splitNovelText, splitNovelTextForVersion } from "./novel-segmentation.js";

describe("splitNovelText", () => {
  it("merges short natural paragraphs while preserving their blank lines", () => {
    expect(splitNovelText(" 第一段。 \n\n\n## 第二段\n内容。 ")).toEqual([
      "第一段。\n\n## 第二段\n内容。"
    ]);
  });

  it("keeps legacy manifests on their original blank-line segmentation", () => {
    const sourceText = "第一段。\n\n第二段。";

    expect(splitNovelTextForVersion(sourceText, 2)).toEqual(["第一段。", "第二段。"]);
    expect(splitNovelTextForVersion(sourceText, 3)).toEqual(["第一段。\n\n第二段。"]);
  });

  it("splits platform-style numbered sections without blank lines", () => {
    const chunks = splitNovelText(
      [
        "原创平台短篇测试。",
        "1.",
        "第一小节内容。",
        "2、",
        "第二小节内容。",
        "3",
        "第三小节内容。"
      ].join("\n")
    );

    expect(chunks).toEqual([
      "原创平台短篇测试。",
      "1.\n第一小节内容。",
      "2、\n第二小节内容。",
      "3\n第三小节内容。"
    ]);
  });

  it("splits common chapter and section headings into reading units", () => {
    const chunks = splitNovelText(
      [
        "序言。",
        "第一章 重逢",
        "章节内容。",
        "第 2 节",
        "小节内容。",
        "第3章",
        "结尾内容。"
      ].join("\n")
    );

    expect(chunks).toEqual([
      "序言。",
      "第一章 重逢\n章节内容。",
      "第 2 节\n小节内容。",
      "第3章\n结尾内容。"
    ]);
  });

  it("splits very long units after chapter detection", () => {
    const chunks = splitNovelText(`第一章\n${"长".repeat(4_500)}\n${"尾".repeat(4_500)}`);

    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThanOrEqual(2_200);
    expect(chunks[0]).toContain("第一章");
  });

  it("merges dialogue-heavy web novel paragraphs without crossing chapter headings", () => {
    const dialogue = Array.from({ length: 12 }, (_, index) => `第${index + 1}句对白。${"内容".repeat(55)}`);
    const chunks = splitNovelText(
      ["第一章颜", ...dialogue, "第二章（完）", ...dialogue].join("\n\n")
    );

    expect(chunks.length).toBeLessThan(8);
    expect(chunks.some((chunk) => chunk.startsWith("第一章颜"))).toBe(true);
    expect(chunks.some((chunk) => chunk.startsWith("第二章（完）"))).toBe(true);
    expect(chunks.every((chunk) => chunk.includes("\n\n") || chunk.length > 300)).toBe(true);
  });
});
