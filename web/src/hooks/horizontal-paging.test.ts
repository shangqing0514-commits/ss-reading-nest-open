import { describe, expect, it } from "vitest";
import { getHorizontalPageDirection } from "./horizontal-paging.js";

describe("getHorizontalPageDirection", () => {
  it("pages only for a clear horizontal swipe", () => {
    expect(getHorizontalPageDirection({ dx: -80, dy: 20 })).toBe("next");
    expect(getHorizontalPageDirection({ dx: 80, dy: 20 })).toBe("previous");
    expect(getHorizontalPageDirection({ dx: 60, dy: 1 })).toBeNull();
    expect(getHorizontalPageDirection({ dx: 80, dy: 70 })).toBeNull();
  });

  it("does not page while editing or selecting text", () => {
    expect(getHorizontalPageDirection({ dx: -100, dy: 0, interactive: true })).toBeNull();
    expect(getHorizontalPageDirection({ dx: -100, dy: 0, selectingText: true })).toBeNull();
  });
});
