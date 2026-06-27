import { describe, expect, it, vi } from "vitest";

const registerAppResource = vi.fn();

vi.mock("@modelcontextprotocol/ext-apps/server", () => ({
  RESOURCE_MIME_TYPE: "text/html+skybridge",
  registerAppResource
}));

describe("registerReadingResource", () => {
  it("uses an app-v8 resource with standard and ChatGPT legacy CSP access to the deployed Worker origin", async () => {
    const { registerReadingResource } = await import("./register-resource.js");
    const { READING_NEST_URI } = await import("./register-tools.js");

    registerReadingResource({} as never, "<html></html>", "https://reading-nest.example.workers.dev");
    const [, , uri, descriptor, loader] = registerAppResource.mock.calls[0];

    expect(READING_NEST_URI).toBe("ui://ss-reading-nest/app-v8.html");
    expect(uri).toBe("ui://ss-reading-nest/app-v8.html");
    expect(descriptor._meta.ui.csp.connectDomains).toContain(
      "https://reading-nest.example.workers.dev"
    );
    expect(descriptor._meta["openai/widgetCSP"].connect_domains).toContain(
      "https://reading-nest.example.workers.dev"
    );

    const loaded = await loader();
    expect(loaded.contents[0].uri).toBe("ui://ss-reading-nest/app-v8.html");
    expect(loaded.contents[0]._meta.ui.csp.connectDomains).toContain(
      "https://reading-nest.example.workers.dev"
    );
    expect(loaded.contents[0]._meta["openai/widgetCSP"].connect_domains).toContain(
      "https://reading-nest.example.workers.dev"
    );
  });
});
