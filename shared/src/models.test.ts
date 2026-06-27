import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION_PREFERENCES } from "./models.js";

describe("DEFAULT_SESSION_PREFERENCES", () => {
  it("defaults companion Dock auto-save to off so chat replies are not blocked by app writes", () => {
    expect(DEFAULT_SESSION_PREFERENCES.autoSaveCompanionComments).toBe(false);
  });
});
