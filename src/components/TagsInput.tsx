import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TAG_SUGESTOES } from "@/lib/domain";

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
}

export function TagsInput({ value, onChange }: Props) {
  const [input, setInput] = useState("");

  const add = (t: string) => {
    const clean = t.trim();
    if (!clean || value.includes(clean)) return;
    onChange([...value, clean]);
    setInput("");
  };
  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  const suggestions = TAG_SUGESTOES.filter(
    (s) => !value.includes(s) && s.toLowerCase().includes(input.toLowerCase()),
  ).slice(0, 6);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1 pr-1">
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              className="rounded-sm hover:bg-muted-foreground/20"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
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
      {input && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((s) => (
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
