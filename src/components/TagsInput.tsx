import { useMemo, useState } from "react";
import { X, Plus, Palette, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TAG_SUGESTOES } from "@/lib/domain";
import { useTagCatalog, useUpsertTag } from "@/lib/tag-catalog-api";
import {
  DEFAULT_TAG_BG,
  DEFAULT_TAG_TEXT,
  TAG_PALETTES,
  readableTextOn,
} from "@/lib/tag-colors";
import { TagBadge } from "./TagBadge";

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
}

export function TagsInput({ value, onChange }: Props) {
  const [input, setInput] = useState("");
  const { data: catalog = [] } = useTagCatalog();
  const upsert = useUpsertTag();

  const catalogNames = useMemo(() => catalog.map((t) => t.name), [catalog]);

  const add = async (name: string) => {
    const clean = name.trim();
    if (!clean || value.includes(clean)) return;
    // Ensure catalog entry exists (default palette) so it can be recolored later
    if (!catalogNames.includes(clean)) {
      try {
        await upsert.mutateAsync({ name: clean, bg_color: DEFAULT_TAG_BG, text_color: DEFAULT_TAG_TEXT });
      } catch {
        /* ignore duplicate races */
      }
    }
    onChange([...value, clean]);
    setInput("");
  };

  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  const changeColor = async (name: string, bg: string, text: string) => {
    await upsert.mutateAsync({ name, bg_color: bg, text_color: text });
  };

  const allSuggestions = useMemo(() => {
    const merged = new Set<string>([...TAG_SUGESTOES, ...catalogNames]);
    value.forEach((v) => merged.delete(v));
    return Array.from(merged)
      .filter((s) => s.toLowerCase().includes(input.toLowerCase()))
      .slice(0, 8);
  }, [catalogNames, input, value]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((t) => {
          const entry = catalog.find((c) => c.name === t);
          const bg = entry?.bg_color ?? DEFAULT_TAG_BG;
          const text = entry?.text_color ?? DEFAULT_TAG_TEXT;
          return (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: bg, color: text }}
            >
              {t}
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" title="Alterar cor" className="rounded-sm opacity-80 hover:opacity-100">
                    <Palette className="size-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3" side="top">
                  <div className="mb-2 text-xs font-medium">Cor da tag "{t}"</div>
                  <div className="mb-3 grid grid-cols-4 gap-2">
                    {TAG_PALETTES.map((p) => {
                      const selected = bg.toLowerCase() === p.bg.toLowerCase();
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => changeColor(t, p.bg, p.text)}
                          className="relative grid size-8 place-items-center rounded-md border"
                          style={{ backgroundColor: p.bg, color: p.text }}
                          title={p.label}
                        >
                          {selected && <Check className="size-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                  <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Cor customizada</label>
                  <input
                    type="color"
                    value={bg}
                    onChange={(e) => changeColor(t, e.target.value, readableTextOn(e.target.value))}
                    className="h-8 w-full rounded border"
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Preview</span>
                    <TagBadge name={t} size="md" />
                  </div>
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => remove(t)}
                className="rounded-sm opacity-80 hover:opacity-100"
                aria-label={`Remover ${t}`}
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(input);
            }
          }}
          placeholder="Adicionar tag e pressionar Enter"
          className="h-9"
        />
        <button
          type="button"
          onClick={() => add(input)}
          className="rounded-md border px-2 hover:bg-accent"
          aria-label="Adicionar tag"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {input && allSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
