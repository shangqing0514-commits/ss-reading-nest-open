const MAX_READING_UNIT_CHARS = 5_000;

export function splitNovelText(sourceText: string): string[] {
  return sourceText
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .flatMap((chunk) => splitBySectionHeadings(chunk))
    .flatMap((chunk) => splitLongUnit(chunk))
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

export function splitNovelTextLegacy(sourceText: string): string[] {
  return sourceText
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
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
    /^第\s*[0-9０-９一二两三四五六七八九十百千万〇零]+\s*[章节卷回部篇集](?:\s|$|[：:、，,.．-])/.test(line) ||
    /^[0-9０-９]{1,4}\s*[.．、)]$/.test(line) ||
    /^[0-9０-９]{1,4}$/.test(line)
  );
}

function splitLongUnit(chunk: string): string[] {
  if (chunk.length <= MAX_READING_UNIT_CHARS) return [chunk];
  const lines = chunk.split("\n");
  const units: string[] = [];
  let current = "";

  for (const line of lines) {
    if (line.length > MAX_READING_UNIT_CHARS) {
      if (current) {
        units.push(current);
        current = "";
      }
      units.push(...splitLongLine(line));
      continue;
    }
    const next = current ? `${current}\n${line}` : line;
    if (next.length > MAX_READING_UNIT_CHARS && current) {
      units.push(current);
      current = line;
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
