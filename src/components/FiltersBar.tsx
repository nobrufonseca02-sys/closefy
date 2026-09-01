import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { TEMPERATURAS, type Temperatura } from "@/lib/domain";

export interface FiltersState {
  q: string;
  temperatura: Temperatura | "all";
  tag: string;
}

export const defaultFilters: FiltersState = {
  q: "",
  temperatura: "all",
  tag: "",
};

interface Props {
  value: FiltersState;
  onChange: (f: FiltersState) => void;
  allTags: string[];
}

export function FiltersBar({ value, onChange, allTags }: Props) {
  const active = value.q || value.temperatura !== "all" || value.tag;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[240px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          placeholder="Buscar cliente, empresa, WhatsApp, e-mail..."
          className="pl-8"
        />
      </div>

      <select
        value={value.temperatura}
        onChange={(e) => onChange({ ...value, temperatura: e.target.value as Temperatura | "all" })}
        className="h-9 rounded-md border bg-background px-2 text-sm"
      >
        <option value="all">Todas as temperaturas</option>
        {TEMPERATURAS.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
      </select>

      <select
        value={value.tag}
        onChange={(e) => onChange({ ...value, tag: e.target.value })}
        className="h-9 rounded-md border bg-background px-2 text-sm"
      >
        <option value="">Todas as tags</option>
        {allTags.map((t) => (<option key={t} value={t}>{t}</option>))}
      </select>

      {active && (
        <Button size="sm" variant="ghost" onClick={() => onChange(defaultFilters)} className="gap-1">
          <X className="size-3.5" /> Limpar
        </Button>
      )}
    </div>
  );
}
