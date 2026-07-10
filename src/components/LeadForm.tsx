import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ETAPAS, TEMPERATURAS, type EtapaFunil, type Lead, type Temperatura } from "@/lib/domain";
import { useCreateLead, useUpdateLead } from "@/lib/leads-api";
import { TagsInput } from "./TagsInput";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead?: Lead | null;
  defaultStage?: EtapaFunil;
}

type FormState = {
  nome_cliente: string;
  nome_empresa: string;
  whatsapp: string;
  email: string;
  cargo: string;
  faturamento_medio: string;
  numero_funcionarios: string;
  ticket_estimado: string;
  temperatura: Temperatura;
  etapa_funil: EtapaFunil;
  origem: string;
  link_reuniao: string;
  data_proxima_reuniao: string;
  data_followup: string;
  observacoes: string;
  tags: string[];
};

const empty = (stage?: EtapaFunil): FormState => ({
  nome_cliente: "",
  nome_empresa: "",
  whatsapp: "",
  email: "",
  cargo: "",
  faturamento_medio: "",
  numero_funcionarios: "",
  ticket_estimado: "",
  temperatura: "precisa_qualificacao",
  etapa_funil: stage ?? "prospectando",
  origem: "",
  link_reuniao: "",
  data_proxima_reuniao: "",
  data_followup: "",
  observacoes: "",
  tags: [],
});

function toInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LeadForm({ open, onOpenChange, lead, defaultStage }: Props) {
  const [f, setF] = useState<FormState>(empty(defaultStage));
  const create = useCreateLead();
  const update = useUpdateLead();

  useEffect(() => {
    if (open) {
      if (lead) {
        setF({
          nome_cliente: lead.nome_cliente,
          nome_empresa: lead.nome_empresa,
          whatsapp: lead.whatsapp,
          email: lead.email ?? "",
          cargo: lead.cargo ?? "",
          faturamento_medio: lead.faturamento_medio ?? "",
          numero_funcionarios: lead.numero_funcionarios ?? "",
          ticket_estimado: lead.ticket_estimado ? String(lead.ticket_estimado) : "",
          temperatura: lead.temperatura,
          etapa_funil: lead.etapa_funil,
          origem: lead.origem ?? "",
          link_reuniao: lead.link_reuniao ?? "",
          data_proxima_reuniao: toInput(lead.data_proxima_reuniao),
          data_followup: toInput(lead.data_followup),
          observacoes: lead.observacoes ?? "",
          tags: lead.tags ?? [],
        });
      } else {
        setF(empty(defaultStage));
      }
    }
  }, [open, lead, defaultStage]);

  const submit = async () => {
    if (!f.nome_cliente || !f.nome_empresa || !f.whatsapp) {
      toast.error("Preencha nome, empresa e WhatsApp");
      return;
    }
    const payload = {
      nome_cliente: f.nome_cliente,
      nome_empresa: f.nome_empresa,
      whatsapp: f.whatsapp,
      email: f.email || null,
      cargo: f.cargo || null,
      faturamento_medio: f.faturamento_medio || null,
      numero_funcionarios: f.numero_funcionarios || null,
      ticket_estimado: f.ticket_estimado ? Number(f.ticket_estimado) : 0,
      temperatura: f.temperatura,
      etapa_funil: f.etapa_funil,
      origem: f.origem || null,
      link_reuniao: f.link_reuniao || null,
      data_proxima_reuniao: f.data_proxima_reuniao ? new Date(f.data_proxima_reuniao).toISOString() : null,
      data_followup: f.data_followup ? new Date(f.data_followup).toISOString() : null,
      observacoes: f.observacoes || null,
      tags: f.tags,
    };
    try {
      if (lead) {
        await update.mutateAsync({ id: lead.id, patch: payload });
        toast.success("Lead atualizado");
      } else {
        await create.mutateAsync(payload);
        toast.success("Lead criado");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao salvar", { description: (e as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead ? "Editar lead" : "Novo lead"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome do cliente *">
            <Input value={f.nome_cliente} onChange={(e) => setF({ ...f, nome_cliente: e.target.value })} />
          </Field>
          <Field label="Empresa *">
            <Input value={f.nome_empresa} onChange={(e) => setF({ ...f, nome_empresa: e.target.value })} />
          </Field>
          <Field label="WhatsApp *">
            <Input value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Cargo">
            <Input value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} />
          </Field>
          <Field label="Origem">
            <Input value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} placeholder="Instagram, indicação..." />
          </Field>
          <Field label="Faturamento médio">
            <Input value={f.faturamento_medio} onChange={(e) => setF({ ...f, faturamento_medio: e.target.value })} />
          </Field>
          <Field label="Nº de funcionários">
            <Input value={f.numero_funcionarios} onChange={(e) => setF({ ...f, numero_funcionarios: e.target.value })} />
          </Field>
          <Field label="Ticket estimado (R$)">
            <Input type="number" value={f.ticket_estimado} onChange={(e) => setF({ ...f, ticket_estimado: e.target.value })} />
          </Field>
          <Field label="Temperatura *">
            <Select value={f.temperatura} onValueChange={(v) => setF({ ...f, temperatura: v as Temperatura })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEMPERATURAS.map((t) => (<SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Etapa do funil *" className="col-span-2">
            <Select value={f.etapa_funil} onValueChange={(v) => setF({ ...f, etapa_funil: v as EtapaFunil })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ETAPAS.map((e) => (<SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Link da reunião" className="col-span-2">
            <Input value={f.link_reuniao} onChange={(e) => setF({ ...f, link_reuniao: e.target.value })} />
          </Field>
          <Field label="Próxima reunião">
            <Input type="datetime-local" value={f.data_proxima_reuniao} onChange={(e) => setF({ ...f, data_proxima_reuniao: e.target.value })} />
          </Field>
          <Field label="Próximo follow-up">
            <Input type="datetime-local" value={f.data_followup} onChange={(e) => setF({ ...f, data_followup: e.target.value })} />
          </Field>
          <Field label="Tags" className="col-span-2">
            <TagsInput value={f.tags} onChange={(tags) => setF({ ...f, tags })} />
          </Field>
          <Field label="Observações" className="col-span-2">
            <Textarea rows={3} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {lead ? "Salvar alterações" : "Criar lead"}
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
