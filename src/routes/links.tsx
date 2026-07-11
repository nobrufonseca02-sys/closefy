import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LinkForm } from "@/components/LinkForm";
import { useLinks, useDeleteLink } from "@/lib/commerce-api";
import { LINK_CATEGORIES, linkCategoryLabel, type ImportantLink, type LinkCategory } from "@/lib/commerce-domain";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Pencil, Trash2, Search, CreditCard } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/links")({
  component: LinksPage,
  head: () => ({ meta: [{ title: "Central de Links · HighTicket Closer" }] }),
});

function LinksPage() {
  const { data: links = [] } = useLinks();
  const del = useDeleteLink();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ImportantLink | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | LinkCategory>("all");
  const [tag, setTag] = useState<string>("");

  const allTags = useMemo(() => {
    const s = new Set<string>();
    links.forEach((l) => l.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [links]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return links.filter((l) => {
      if (cat !== "all" && l.category !== cat) return false;
      if (tag && !l.tags.includes(tag)) return false;
      if (query) {
        const hay = `${l.title} ${l.url} ${l.category} ${l.client_name ?? ""} ${l.company_name ?? ""} ${l.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [links, q, cat, tag]);

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (l: ImportantLink) => { setEditing(l); setOpen(true); };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const remove = async (l: ImportantLink) => {
    if (!confirm(`Excluir "${l.title}"?`)) return;
    await del.mutateAsync(l.id);
    toast.success("Link excluído");
  };

  return (
    <AppShell primaryAction={{ label: "Novo Link", onClick: openNew }}>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Central de Links</h1>
        <p className="text-sm text-muted-foreground">Guarde links de pagamento, propostas, contratos, reuniões e materiais.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, URL, cliente, empresa, tag..." className="pl-8" />
        </div>
        <Select value={cat} onValueChange={(v) => setCat(v as typeof cat)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {LINK_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tag || "all"} onValueChange={(v) => setTag(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tag" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas tags</SelectItem>
            {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          Nenhum link cadastrado ainda. Clique em <strong className="text-foreground">Novo Link</strong> para começar.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((l) => {
            const isPayment = l.category === "pagamento";
            return (
              <div
                key={l.id}
                className={
                  "flex flex-col rounded-xl border bg-card p-4 shadow-sm transition hover:shadow-md " +
                  (isPayment ? "border-primary/50 ring-1 ring-primary/20" : "")
                }
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isPayment && <CreditCard className="size-4 text-primary shrink-0" />}
                      <h3 className="truncate font-semibold">{l.title}</h3>
                    </div>
                    <a href={l.url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs text-muted-foreground hover:text-primary">
                      {l.url}
                    </a>
                  </div>
                  <Badge variant={isPayment ? "default" : "secondary"} className="shrink-0">{linkCategoryLabel(l.category)}</Badge>
                </div>
                {l.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{l.description}</p>}
                {(l.client_name || l.company_name) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[l.client_name, l.company_name].filter(Boolean).join(" · ")}
                  </p>
                )}
                {l.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {l.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-1">
                  <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => copy(l.url)}>
                    <Copy className="size-3.5" /> Copiar
                  </Button>
                  <Button size="sm" variant="secondary" className="gap-1.5" asChild>
                    <a href={l.url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Abrir</a>
                  </Button>
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(l)}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(l)}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LinkForm open={open} onOpenChange={setOpen} link={editing} />
    </AppShell>
  );
}
