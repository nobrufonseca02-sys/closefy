import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, type RefObject } from "react";
import { AppShell } from "@/components/AppShell";
import { LeadForm } from "@/components/LeadForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLeads } from "@/lib/leads-api";
import { useStoredLinks } from "@/lib/commercial-storage";
import {
  LINK_CATEGORIES,
  applyLeadToLink,
  buildImportantLink,
  emptyLinkDraft,
  normalizeExternalUrl,
  parseTags,
  type ImportantLink,
  type ImportantLinkDraft,
  type LinkCategory,
} from "@/lib/commercial";
import { Copy, ExternalLink, Link as LinkIcon, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/links")({
  head: () => ({
    meta: [{ title: "Links | HighTicket Closer" }],
  }),
  component: LinksPage,
});

type LinkForm = Omit<ImportantLinkDraft, "tags"> & { tags: string };

function LinksPage() {
  const { data: leads = [] } = useLeads();
  const { links, setLinks } = useStoredLinks();
  const titleRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<HTMLInputElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);
  const tagsRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LinkForm>(() => toForm(emptyLinkDraft));
  const [formKey, setFormKey] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<LinkCategory | "all">("all");
  const [tag, setTag] = useState<string>("all");

  const allTags = useMemo(() => Array.from(new Set(links.flatMap((link) => link.tags))).sort(), [links]);

  const filteredLinks = useMemo(() => {
    const q = normalize(search);
    return links.filter((link) => {
      if (category !== "all" && link.category !== category) return false;
      if (tag !== "all" && !link.tags.includes(tag)) return false;
      if (!q) return true;
      const haystack = [
        link.title,
        link.url,
        link.category,
        link.clientName,
        link.companyName,
        link.description,
        link.tags.join(" "),
      ].join(" ");
      return normalize(haystack).includes(q);
    });
  }, [category, links, search, tag]);

  function saveLink() {
    const draft = readLinkForm({ titleRef, urlRef, clientRef, companyRef, tagsRef, descriptionRef }, form);
    if (!draft.title.trim() || !draft.url.trim()) {
      toast.error("Informe título e URL para salvar o link.");
      return;
    }

    const existing = editingId ? links.find((link) => link.id === editingId) : undefined;
    const next = buildImportantLink(draft, existing);
    setLinks((current) => (existing ? current.map((link) => (link.id === existing.id ? next : link)) : [next, ...current]));
    setEditingId(null);
    setForm(toForm(emptyLinkDraft));
    setFormKey((current) => current + 1);
    toast.success(existing ? "Link atualizado." : "Link cadastrado.");
  }

  function editLink(link: ImportantLink) {
    setEditingId(link.id);
    setForm(toForm(link));
    setFormKey((current) => current + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteLink(id: string) {
    setLinks((current) => current.filter((link) => link.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setForm(toForm(emptyLinkDraft));
      setFormKey((current) => current + 1);
    }
    toast.success("Link excluído.");
  }

  function updateLead(leadId: string) {
    const lead = leads.find((item) => item.id === leadId);
    setForm((current) => toForm(applyLeadToLink(toDraft(current), lead)));
    setFormKey((current) => current + 1);
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado.");
  }

  return (
    <AppShell onNewLead={() => setFormOpen(true)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Central de Links</h1>
          <p className="text-sm text-muted-foreground">Links importantes da operação comercial em um só lugar.</p>
        </div>
        <Button className="gap-2" onClick={saveLink}>
          <Plus className="size-4" /> {editingId ? "Salvar link" : "Novo Link"}
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div key={formKey} className="contents">
          <Field label="Título">
            <Input ref={titleRef} aria-label="Título" name="title" defaultValue={form.title} />
          </Field>
          <Field label="URL">
            <Input ref={urlRef} aria-label="URL" name="url" defaultValue={form.url} placeholder="https://..." />
          </Field>
          <Field label="Categoria">
            <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value as LinkCategory }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LINK_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Lead relacionado">
            <Select value={form.leadId || "none"} onValueChange={(value) => updateLead(value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Sem lead" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem lead</SelectItem>
                {leads.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id}>{lead.nome_cliente} - {lead.nome_empresa}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cliente">
            <Input ref={clientRef} aria-label="Cliente" name="clientName" defaultValue={form.clientName} />
          </Field>
          <Field label="Empresa">
            <Input ref={companyRef} aria-label="Empresa" name="companyName" defaultValue={form.companyName} />
          </Field>
          <Field label="Tags">
            <Input ref={tagsRef} aria-label="Tags" name="tags" defaultValue={form.tags} placeholder="pagamento, proposta" />
          </Field>
          <div className="grid gap-2 md:col-span-2 xl:col-span-4">
            <Label>Descrição</Label>
            <Textarea ref={descriptionRef} aria-label="Descrição" name="description" defaultValue={form.description} />
          </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Busca de links" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título, URL, categoria, cliente, empresa ou tag" />
        </div>
        <Select value={category} onValueChange={(value) => setCategory(value as LinkCategory | "all")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {LINK_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as tags</SelectItem>
            {allTags.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredLinks.map((link) => (
          <Card key={link.id} className={link.category === "Pagamento" ? "border-warning/60 bg-warning/5" : ""}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge variant={link.category === "Pagamento" ? "default" : "secondary"}>{link.category}</Badge>
                  <h2 className="mt-2 truncate text-base font-semibold">{link.title}</h2>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{link.url}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" title="Copiar link" onClick={() => copyLink(link.url)}><Copy className="size-4" /></Button>
                  <Button variant="ghost" size="icon" title="Abrir link" onClick={() => window.open(normalizeExternalUrl(link.url), "_blank", "noopener,noreferrer")}><ExternalLink className="size-4" /></Button>
                  <Button variant="ghost" size="icon" title="Editar link" onClick={() => editLink(link)}><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" title="Excluir link" onClick={() => deleteLink(link.id)}><Trash2 className="size-4 text-danger" /></Button>
                </div>
              </div>
              {link.description && <p className="mt-3 text-sm">{link.description}</p>}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{link.clientName || "Sem cliente"}</span>
                <span>·</span>
                <span>{link.companyName || "Sem empresa"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {link.tags.length ? link.tags.map((item) => <Badge key={item} variant="outline">{item}</Badge>) : <Badge variant="outline">Sem tags</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredLinks.length === 0 && (
        <Card className="mt-4 border-dashed">
          <CardContent className="grid place-items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <LinkIcon className="size-5" />
            Nenhum link encontrado.
          </CardContent>
        </Card>
      )}

      <LeadForm open={formOpen} onOpenChange={setFormOpen} />
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function toForm(link: ImportantLinkDraft): LinkForm {
  return { ...link, tags: link.tags.join(", ") };
}

function toDraft(form: LinkForm): ImportantLinkDraft {
  return { ...form, tags: parseTags(form.tags) };
}

function readLinkForm(
  refs: {
    titleRef: RefObject<HTMLInputElement | null>;
    urlRef: RefObject<HTMLInputElement | null>;
    clientRef: RefObject<HTMLInputElement | null>;
    companyRef: RefObject<HTMLInputElement | null>;
    tagsRef: RefObject<HTMLInputElement | null>;
    descriptionRef: RefObject<HTMLTextAreaElement | null>;
  },
  fallback: LinkForm,
): ImportantLinkDraft {
  return {
    title: refs.titleRef.current?.value ?? fallback.title,
    url: refs.urlRef.current?.value ?? fallback.url,
    category: fallback.category,
    description: refs.descriptionRef.current?.value ?? "",
    clientName: refs.clientRef.current?.value ?? "",
    companyName: refs.companyRef.current?.value ?? "",
    leadId: fallback.leadId,
    tags: parseTags(refs.tagsRef.current?.value ?? ""),
  };
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
