export type PageDirection = "previous" | "next";

export function getHorizontalPageDirection(input: {
  dx: number;
  dy: number;
  interactive?: boolean;
  selectingText?: boolean;
}): PageDirection | null {
  if (input.interactive || input.selectingText) return null;
  if (Math.abs(input.dx) < 64) return null;
  if (Math.abs(input.dx) < Math.abs(input.dy) * 1.5) return null;
  return input.dx < 0 ? "next" : "previous";
}
