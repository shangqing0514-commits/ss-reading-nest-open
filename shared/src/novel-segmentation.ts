import { NOVEL_SEGMENTATION_VERSION } from "./models.js";

const TARGET_READING_UNIT_CHARS = 1_800;
const MAX_READING_UNIT_CHARS = 2_000;

export function splitNovelText(sourceText: string): string[] {
  const paragraphs = sourceText
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .flatMap((chunk) => splitBySectionHeadings(chunk))
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return mergeShortUnits(paragraphs).flatMap((chunk) => splitLongUnit(chunk));
}

export function splitNovelTextLegacy(sourceText: string): string[] {
  return sourceText
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

export function splitNovelTextForVersion(sourceText: string, segmentationVersion: number): string[] {
  return segmentationVersion < NOVEL_SEGMENTATION_VERSION
    ? splitNovelTextLegacy(sourceText)
    : splitNovelText(sourceText);
}

function splitBySectionHeadings(chunk: string): string[] {
  const lines = chunk.replace(/\r\n?/g, "\n").split("\n");
  const units: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isSectionHeading(trimmed) && current.length > 0) {
      units.push(current.join("\n"));
      current = [trimmed];
      continue;
    }
    current.push(trimmed);
  }

  if (current.length > 0) units.push(current.join("\n"));
  return units;
}

function isSectionHeading(line: string): boolean {
  return (
    /^第\s*[0-9０-９一二两三四五六七八九十百千万〇零]+\s*[章节卷回部篇集](?!.*[。！？!?]$).{0,40}$/.test(line) ||
    /^[0-9０-９]{1,4}\s*[.．、)]$/.test(line) ||
    /^[0-9０-９]{1,4}$/.test(line)
  );
}

function mergeShortUnits(paragraphs: string[]): string[] {
  const units: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const startsSection = isSectionHeading(paragraph.split("\n", 1)[0]?.trim() ?? "");
    if (startsSection && current) {
      units.push(current);
      current = paragraph;
      continue;
    }
    if (!current) {
      current = paragraph;
      continue;
    }

    const combined = `${current}\n\n${paragraph}`;
    if (combined.length <= TARGET_READING_UNIT_CHARS) {
      current = combined;
    } else {
      units.push(current);
      current = paragraph;
    }
  }

  if (current) units.push(current);
  return units;
}

function splitLongUnit(chunk: string): string[] {
  if (chunk.length <= MAX_READING_UNIT_CHARS) return [chunk];
  const paragraphs = chunk.split(/\n[ \t]*\n+/);
  const units: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_READING_UNIT_CHARS) {
      if (current) {
        units.push(current);
        current = "";
      }
      units.push(...splitLongLine(paragraph));
      continue;
    }
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > MAX_READING_UNIT_CHARS && current) {
      units.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) units.push(current);
  return units;
}

function splitLongLine(line: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < line.length; start += MAX_READING_UNIT_CHARS) {
    chunks.push(line.slice(start, start + MAX_READING_UNIT_CHARS));
  }
  return chunks;
}
