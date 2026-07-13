export interface TagPalette {
  label: string;
  bg: string;
  text: string;
}

export const TAG_PALETTES: TagPalette[] = [
  { label: "Cinza", bg: "#e5e7eb", text: "#111827" },
  { label: "Vermelho", bg: "#dc2626", text: "#ffffff" },
  { label: "Laranja", bg: "#f97316", text: "#ffffff" },
  { label: "Amarelo", bg: "#fde047", text: "#111827" },
  { label: "Verde", bg: "#16a34a", text: "#ffffff" },
  { label: "Azul", bg: "#2563eb", text: "#ffffff" },
  { label: "Roxo", bg: "#7c3aed", text: "#ffffff" },
  { label: "Rosa", bg: "#ec4899", text: "#ffffff" },
];

export const DEFAULT_TAG_BG = "#e5e7eb";
export const DEFAULT_TAG_TEXT = "#111827";

/** Compute readable text color (#111 or #fff) for a hex background. */
export function readableTextOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#111827";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // relative luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111827" : "#ffffff";
}
