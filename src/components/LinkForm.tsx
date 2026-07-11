import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LINK_CATEGORIES, type ImportantLink, type LinkCategory } from "@/lib/commerce-domain";
import { useCreateLink, useUpdateLink } from "@/lib/commerce-api";
import { useLeads } from "@/lib/leads-api";
import { TagsInput } from "./TagsInput";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  link?: ImportantLink | null;
}

type F = {
  title: string;
  url: string;
  category: LinkCategory;
  description: string;
  client_name: string;
  company_name: string;
  lead_id: string;
  tags: string[];
};

const empty = (): F => ({
  title: "", url: "", category: "outro", description: "",
  client_name: "", company_name: "", lead_id: "", tags: [],
});

export function LinkForm({ open, onOpenChange, link }: Props) {
  const [f, setF] = useState<F>(empty());
  const { data: leads = [] } = useLeads();
  const create = useCreateLink();
  const update = useUpdateLink();

  useEffect(() => {
    if (!open) return;
    if (link) {
      setF({
        title: link.title,
        url: link.url,
        category: link.category,
        description: link.description ?? "",
        client_name: link.client_name ?? "",
        company_name: link.company_name ?? "",
        lead_id: link.lead_id ?? "",
        tags: link.tags ?? [],
      });
    } else setF(empty());
  }, [open, link]);

  const submit = async () => {
    if (!f.title || !f.url) {
      toast.error("Preencha título e URL");
      return;
    }
    const payload = {
      title: f.title,
      url: f.url,
      category: f.category,
      description: f.description || null,
      client_name: f.client_name || null,
      company_name: f.company_name || null,
      lead_id: f.lead_id || null,
      tags: f.tags,
    };
    try {
      if (link) {
        await update.mutateAsync({ id: link.id, patch: payload });
        toast.success("Link atualizado");
      } else {
        await create.mutateAsync(payload);
        toast.success("Link criado");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao salvar", { description: (e as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>{link ? "Editar link" : "Novo link"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Título *" className="col-span-2">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label="URL *" className="col-span-2">
            <Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://..." />
          </Field>
          <Field label="Categoria *">
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v as LinkCategory })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LINK_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Lead relacionado">
            <Select value={f.lead_id || "none"} onValueChange={(v) => setF({ ...f, lead_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome_cliente} · {l.nome_empresa}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cliente">
            <Input value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} />
          </Field>
          <Field label="Empresa">
            <Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} />
          </Field>
          <Field label="Tags" className="col-span-2">
            <TagsInput value={f.tags} onChange={(tags) => setF({ ...f, tags })} />
          </Field>
          <Field label="Descrição" className="col-span-2">
            <Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {link ? "Salvar" : "Criar link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
