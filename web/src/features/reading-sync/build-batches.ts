import type { SyncBatch } from "./types.js";

export function buildSyncBatches(input: {
  chunks: string[];
  rangeStart: number;
  rangeEnd: number;
  targetMinChars?: number;
  targetMaxChars?: number;
  hardMaxChars?: number;
  idFactory: (ordinal: number) => string;
}): SyncBatch[] {
  const targetMinChars = input.targetMinChars ?? 8_000;
  const targetMaxChars = input.targetMaxChars ?? 12_000;
  const hardMaxChars = input.hardMaxChars ?? 20_000;
  const groups: Array<{ start: number; end: number; paragraphs: string[]; oversized: boolean }> = [];
  let current: { start: number; end: number; paragraphs: string[]; oversized: boolean } | null =
    null;

  for (let index = input.rangeStart; index <= input.rangeEnd; index += 1) {
    const paragraph = input.chunks[index - 1] ?? "";
    const standalone = formatParagraph(index, paragraph);
    if (standalone.length > hardMaxChars) {
      throw new Error(`第 ${index} 段超过 ${hardMaxChars} 字符硬限制`);
    }

    if (!current) {
      current = {
        start: index,
        end: index,
        paragraphs: [paragraph],
        oversized: standalone.length > targetMaxChars
      };
      continue;
    }

    const currentText = formatRange(current.start, current.paragraphs);
    const projected = formatRange(current.start, [...current.paragraphs, paragraph]);
    if (
      current.oversized ||
      (currentText.length >= targetMinChars && projected.length > targetMaxChars)
    ) {
      groups.push(current);
      current = {
        start: index,
        end: index,
        paragraphs: [paragraph],
        oversized: standalone.length > targetMaxChars
      };
      continue;
    }

    current.end = index;
    current.paragraphs.push(paragraph);
  }

  if (current) groups.push(current);

  return groups.map((group, groupIndex) => {
    const text = formatRange(group.start, group.paragraphs);
    const ordinal = groupIndex + 1;
    return {
      id: input.idFactory(ordinal),
      ordinal,
      totalBatches: groups.length,
      rangeStart: group.start,
      rangeEnd: group.end,
      characterCount: text.length,
      text,
      isFinal: ordinal === groups.length,
      oversizedParagraph: group.oversized,
      status: "pending"
    };
  });
}

function formatRange(start: number, paragraphs: string[]) {
  return paragraphs
    .map((paragraph, offset) => formatParagraph(start + offset, paragraph))
    .join("\n\n");
}

function formatParagraph(index: number, paragraph: string) {
  return `【第 ${index} 段】\n${paragraph}`;
}
