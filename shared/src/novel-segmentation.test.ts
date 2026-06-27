import { describe, expect, it } from "vitest";
import { splitNovelText } from "./novel-segmentation.js";

describe("splitNovelText", () => {
  it("keeps ordinary blank-line novels split by natural paragraphs", () => {
    expect(splitNovelText(" 第一段。 \n\n\n## 第二段\n内容。 ")).toEqual([
      "第一段。",
      "## 第二段\n内容。"
    ]);
  });

  it("splits platform-style numbered sections without blank lines", () => {
    const chunks = splitNovelText(
      [
        "原创测试故事。",
        "1.",
        "第一小节内容。",
        "2、",
        "第二小节内容。",
        "3",
        "第三小节内容。"
      ].join("\n")
    );

    expect(chunks).toEqual([
      "原创测试故事。",
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
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThanOrEqual(5_200);
    expect(chunks[0]).toContain("第一章");
  });
});
