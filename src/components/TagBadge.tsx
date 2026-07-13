import { useTagCatalog } from "@/lib/tag-catalog-api";
import { DEFAULT_TAG_BG, DEFAULT_TAG_TEXT } from "@/lib/tag-colors";

interface Props {
  name: string;
  size?: "sm" | "md";
  className?: string;
}

export function TagBadge({ name, size = "sm", className = "" }: Props) {
  const { data: catalog = [] } = useTagCatalog();
  const entry = catalog.find((t) => t.name === name);
  const bg = entry?.bg_color ?? DEFAULT_TAG_BG;
  const text = entry?.text_color ?? DEFAULT_TAG_TEXT;
  const sz = size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sz} ${className}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {name}
    </span>
  );
}
