import { describe, expect, it } from "vitest";
import { buildSyncBatches } from "./build-batches.js";

describe("buildSyncBatches", () => {
  it("keeps complete paragraphs together within the target range", () => {
    const chunks = ["a".repeat(7_999), "b".repeat(2_000), "c".repeat(3_000)];
    const batches = buildSyncBatches({
      chunks,
      rangeStart: 1,
      rangeEnd: 3,
      targetMinChars: 8_000,
      targetMaxChars: 12_000,
      hardMaxChars: 20_000,
      idFactory: (ordinal) => `batch-${ordinal}`
    });

    expect(batches).toHaveLength(2);
    expect(batches[0]).toMatchObject({ rangeStart: 1, rangeEnd: 2, ordinal: 1 });
    expect(batches[1]).toMatchObject({ rangeStart: 3, rangeEnd: 3, ordinal: 2 });
    expect(batches.map((batch) => batch.text).join("")).toContain("a".repeat(7_999));
  });

  it("does not add a paragraph that would exceed 12000 after reaching 8000", () => {
    const chunks = ["a".repeat(8_500), "b".repeat(4_000)];
    const batches = buildSyncBatches({
      chunks,
      rangeStart: 1,
      rangeEnd: 2,
      idFactory: (ordinal) => `batch-${ordinal}`
    });

    expect(batches).toHaveLength(2);
    expect(batches[0]?.rangeEnd).toBe(1);
    expect(batches[1]?.rangeStart).toBe(2);
  });

  it("places one oversized paragraph in its own batch without splitting it", () => {
    const paragraph = "长".repeat(13_000);
    const [batch] = buildSyncBatches({
      chunks: [paragraph],
      rangeStart: 1,
      rangeEnd: 1,
      idFactory: () => "batch-1"
    });

    expect(batch?.rangeStart).toBe(1);
    expect(batch?.rangeEnd).toBe(1);
    expect(batch?.text).toContain(paragraph);
    expect(batch?.oversizedParagraph).toBe(true);
  });

  it("assigns stable ordinals, totals and final status", () => {
    const batches = buildSyncBatches({
      chunks: ["a".repeat(9_000), "b".repeat(9_000), "c"],
      rangeStart: 1,
      rangeEnd: 3,
      idFactory: (ordinal) => `batch-${ordinal}`
    });

    expect(batches.map(({ id, ordinal, totalBatches, isFinal }) => ({
      id,
      ordinal,
      totalBatches,
      isFinal
    }))).toEqual([
      { id: "batch-1", ordinal: 1, totalBatches: 2, isFinal: false },
      { id: "batch-2", ordinal: 2, totalBatches: 2, isFinal: true }
    ]);
  });
});
