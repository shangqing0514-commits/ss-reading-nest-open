export async function syncCurrentContext(input: {
  context: Record<string, unknown>;
  successPrompt: string;
  fallbackPrompt: string;
  updateModelContext: (context: Record<string, unknown>) => Promise<boolean>;
  sendMessage: (
    prompt: string,
    options?: { scrollToBottom?: boolean }
  ) => Promise<void>;
}) {
  const updated = await input.updateModelContext(input.context);
  await input.sendMessage(updated ? input.successPrompt : input.fallbackPrompt, {
    scrollToBottom: false
  });
  return updated ? ("context" as const) : ("message-fallback" as const);
}
