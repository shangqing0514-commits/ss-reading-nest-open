export function toolResult<T extends Record<string, unknown>>(structuredContent: T, text: string) {
  return {
    structuredContent,
    content: [{ type: "text" as const, text }]
  };
}
