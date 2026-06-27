import { describe, expect, it } from "vitest";
import { splitNovelText } from "./split-text.js";

describe("splitNovelText", () => {
  it("splits TXT or Markdown on blank lines and removes empty chunks", () => {
    expect(splitNovelText(" 第一段。 \n\n\n## 第二段\n内容。 ")).toEqual([
      "第一段。",
      "## 第二段\n内容。"
    ]);
  });
});
