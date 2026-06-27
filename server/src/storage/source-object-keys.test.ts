import { describe, expect, it } from "vitest";
import {
  buildSourceManifestObjectKey,
  buildSourceObjectKey,
  buildSourcePageObjectKey
} from "./source-object-keys.js";

describe("source object key helpers", () => {
  it("builds private source object keys", () => {
    expect(buildSourceObjectKey("source-abc")).toBe(
      "private/sources/source-abc/source.txt"
    );
    expect(buildSourceManifestObjectKey("source-abc")).toBe(
      "private/sources/source-abc/manifest.json"
    );
    expect(buildSourcePageObjectKey("source-abc", 3, "png")).toBe(
      "private/sources/source-abc/pages/3.png"
    );
  });

  it("does not leak titles, hashes, original filenames, or source text snippets", () => {
    const key = buildSourceObjectKey("source-opaque");

    expect(key).not.toContain("My Book");
    expect(key).not.toContain("abcdef1234567890");
    expect(key).not.toContain("chapter-1.txt");
    expect(key).not.toContain("第一段正文");
  });

  it("rejects unsafe source ids", () => {
    for (const sourceId of ["", "source/abc", "../source", "source abc", "source\tabc"]) {
      expect(() => buildSourceObjectKey(sourceId)).toThrow();
    }
  });

  it("rejects unsafe page indexes and extensions", () => {
    expect(() => buildSourcePageObjectKey("source-abc", 0, "png")).toThrow();
    expect(() => buildSourcePageObjectKey("source-abc", 1.5, "png")).toThrow();

    for (const extension of ["", "../png", "png/evil", "pn g", ".png"]) {
      expect(() => buildSourcePageObjectKey("source-abc", 1, extension)).toThrow();
    }
  });
});
