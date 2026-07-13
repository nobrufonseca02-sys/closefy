import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, DollarSign, ExternalLink, History, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  ETAPAS, SLA_STYLES, TEMPERATURAS, calcSLA, etapaLabel, formatCurrency,
  formatDate, relativeTime, tempStyle,
  type EtapaFunil, type Lead, type Temperatura,
} from "@/lib/domain";
import { useCreateFeedback, useDeleteFeedback, useDeleteLead, useFeedbacks, useUpdateLead } from "@/lib/leads-api";
import { useSales } from "@/lib/commerce-api";
import { useLeadHistory } from "@/lib/tag-catalog-api";
import { formatBRL, statusStyle } from "@/lib/commerce-domain";
import { SaleForm } from "./SaleForm";
import { TagBadge } from "./TagBadge";
import { TagsInput } from "./TagsInput";

interface Props {
  lead: Lead | null;
  onOpenChange: (o: boolean) => void;
  onEdit: (l: Lead) => void;
}

export function LeadDetail({ lead, onOpenChange, onEdit }: Props) {
  const { data: feedbacks = [] } = useFeedbacks(lead?.id ?? null);
  const { data: allSales = [] } = useSales();
  const { data: history = [] } = useLeadHistory(lead?.id ?? null);
  const update = useUpdateLead();
  const del = useDeleteLead();
  const createFb = useCreateFeedback();
  const delFb = useDeleteFeedback();

  const [showFbForm, setShowFbForm] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);

  if (!lead) return null;
  const sla = calcSLA(lead);
  const temp = tempStyle(lead.temperatura);

  const quickPatch = (patch: Partial<Lead>) =>
    update.mutate({ id: lead.id, patch }, { onSuccess: () => toast.success("Atualizado") });

  const copyWa = () => {
    navigator.clipboard.writeText(lead.whatsapp);
    toast.success("WhatsApp copiado");
  };

  return (
    <Sheet open={!!lead} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b bg-card px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="truncate text-lg">{lead.nome_cliente}</SheetTitle>
              <div className="mt-0.5 text-sm text-muted-foreground">{lead.nome_empresa}</div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" className="gap-1" onClick={() => setSaleOpen(true)}>
                <DollarSign className="size-3.5" /> Registrar compra
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onEdit(lead)}>
                <Pencil className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm("Excluir este lead?"))
                    del.mutate(lead.id, {
                      onSuccess: () => { toast.success("Lead excluído"); onOpenChange(false); },
                    });
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${temp.color}`}>{temp.label}</span>
            <Badge variant="secondary">{etapaLabel(lead.etapa_funil)}</Badge>
            {sla !== "na" && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${SLA_STYLES[sla].className}`}>
                {SLA_STYLES[sla].label}
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 px-6 py-5">
          {/* Quick edit strip */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Temperatura</Label>
              <Select value={lead.temperatura} onValueChange={(v) => quickPatch({ temperatura: v as Temperatura })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPERATURAS.map((t) => (<SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Etapa</Label>
              <Select value={lead.etapa_funil} onValueChange={(v) => quickPatch({ etapa_funil: v as EtapaFunil })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ETAPAS.map((e) => (<SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Próxima reunião</Label>
              <Input
                type="datetime-local"
                className="h-8"
                defaultValue={lead.data_proxima_reuniao ? toInput(lead.data_proxima_reuniao) : ""}
                onBlur={(e) => quickPatch({ data_proxima_reuniao: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Próximo follow-up</Label>
              <Input
                type="datetime-local"
                className="h-8"
                defaultValue={lead.data_followup ? toInput(lead.data_followup) : ""}
                onBlur={(e) => quickPatch({ data_followup: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Link da reunião</Label>
              <Input
                className="h-8"
                defaultValue={lead.link_reuniao ?? ""}
                onBlur={(e) => quickPatch({ link_reuniao: e.target.value || null })}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Tags</Label>
              <TagsInput value={lead.tags} onChange={(tags) => quickPatch({ tags })} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Info label="WhatsApp">
                <div className="flex items-center gap-2">
                  <span>{lead.whatsapp}</span>
                  <button onClick={copyWa} className="text-muted-foreground hover:text-foreground">
                    <Copy className="size-3.5" />
                  </button>
                </div>
              </Info>
              <Info label="E-mail">{lead.email ?? "—"}</Info>
              <Info label="Cargo">{lead.cargo ?? "—"}</Info>
              <Info label="Origem">{lead.origem ?? "—"}</Info>
              <Info label="Faturamento">{lead.faturamento_medio ?? "—"}</Info>
              <Info label="Funcionários">{lead.numero_funcionarios ?? "—"}</Info>
              <Info label="Ticket estimado">{formatCurrency(lead.ticket_estimado)}</Info>
              <Info label="Última atividade">{relativeTime(lead.ultima_atividade_em)}</Info>
              <Info label="Próxima reunião">{formatDate(lead.data_proxima_reuniao)}</Info>
              <Info label="Próximo follow-up">{formatDate(lead.data_followup)}</Info>
            </dl>
            {lead.link_reuniao && (
              <a
                href={lead.link_reuniao}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Abrir sala <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observações</h3>
            <Textarea
              rows={3}
              defaultValue={lead.observacoes ?? ""}
              onBlur={(e) => quickPatch({ observacoes: e.target.value || null })}
              placeholder="Notas internas..."
            />
          </div>

          <Separator />

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Feedbacks de reunião ({feedbacks.length})
              </h3>
              <Button size="sm" variant="outline" onClick={() => setShowFbForm((v) => !v)} className="gap-1 h-7">
                <Plus className="size-3.5" /> Adicionar
              </Button>
            </div>

            {showFbForm && (
              <FeedbackForm
                onSubmit={async (payload) => {
                  await createFb.mutateAsync({ ...payload, lead_id: lead.id });
                  setShowFbForm(false);
                  toast.success("Feedback registrado");
                }}
                onCancel={() => setShowFbForm(false)}
              />
            )}

            <ul className="space-y-3">
              {feedbacks.map((fb) => (
                <li key={fb.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      {formatDate(fb.data_reuniao)}
                      {fb.resultado_reuniao && (
                        <Badge variant="outline" className="ml-2">{fb.resultado_reuniao}</Badge>
                      )}
                    </div>
                    <button
                      onClick={() => delFb.mutate({ id: fb.id, leadId: lead.id })}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  {fb.resumo && <p className="mt-2 text-sm">{fb.resumo}</p>}
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {fb.dor_principal && <FbLine k="Dor" v={fb.dor_principal} />}
                    {fb.objecoes && <FbLine k="Objeções" v={fb.objecoes} />}
                    {fb.nivel_urgencia && <FbLine k="Urgência" v={fb.nivel_urgencia} />}
                    {fb.proximo_passo && <FbLine k="Próximo passo" v={fb.proximo_passo} />}
                    {fb.percepcao_closer && <FbLine k="Percepção" v={fb.percepcao_closer} />}
                  </div>
                  {fb.link_gravacao && (
                    <a href={fb.link_gravacao} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Gravação <ExternalLink className="size-3" />
                    </a>
                  )}
                </li>
              ))}
              {feedbacks.length === 0 && !showFbForm && (
                <li className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                  Nenhum feedback ainda
                </li>
              )}
            </ul>
          </div>

          <Separator />

          <LeadSalesSection sales={allSales.filter((s) => s.lead_id === lead.id)} />

          <Separator />

          <LeadHistorySection history={history} />
        </div>
      </SheetContent>
      <SaleForm open={saleOpen} onOpenChange={setSaleOpen} defaultLeadId={lead.id} />
    </Sheet>
  );
}

function LeadSalesSection({ sales }: { sales: import("@/lib/commerce-domain").Sale[] }) {
  const totalBought = sales
    .filter((s) => s.payment_status !== "cancelado" && s.payment_status !== "reembolsado")
    .reduce((a, s) => a + Number(s.sale_value), 0);
  const totalCommission = sales.reduce((a, s) => a + Number(s.commission_value), 0);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Compras ({sales.length})
        </h3>
        {sales.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Total: <strong className="text-foreground">{formatBRL(totalBought)}</strong>
            {" · "}Comissão: <strong className="text-foreground">{formatBRL(totalCommission)}</strong>
          </span>
        )}
      </div>
      {sales.length === 0 ? (
        <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          Nenhuma compra registrada
        </div>
      ) : (
        <ul className="space-y-2">
          {sales.map((s) => {
            const st = statusStyle(s.payment_status);
            return (
              <li key={s.id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{s.product_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.sale_date).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <Badge variant="outline" className={st.className}>{st.label}</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span>Valor: <strong className="text-foreground">{formatBRL(Number(s.sale_value))}</strong></span>
                  <span>Comissão: <strong className="text-foreground">{formatBRL(Number(s.commission_value))}</strong></span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LeadHistorySection({ history }: { history: import("@/lib/tag-catalog-api").LeadHistoryEntry[] }) {
  return (
    <div>
      <h3 className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <History className="size-3" /> Histórico de movimentações
      </h3>
      {history.length === 0 ? (
        <div className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">
          Nenhuma movimentação registrada
        </div>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {history.slice(0, 20).map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1.5">
              <span>
                {h.from_stage ? etapaLabel(h.from_stage as EtapaFunil) : "—"}
                {" → "}
                <strong className="text-foreground">{etapaLabel(h.to_stage as EtapaFunil)}</strong>
              </span>
              <span className="text-muted-foreground">{formatDate(h.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function FbLine({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{k}: </span>
      <span>{v}</span>
    </div>
  );
}

function toInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FeedbackForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (p: {
    data_reuniao: string;
    resumo: string | null;
    dor_principal: string | null;
    objecoes: string | null;
    nivel_urgencia: string | null;
    proximo_passo: string | null;
    percepcao_closer: string | null;
    link_gravacao: string | null;
    resultado_reuniao: string | null;
  }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const nowInput = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const [s, setS] = useState({
    data_reuniao: nowInput,
    resumo: "",
    dor_principal: "",
    objecoes: "",
    nivel_urgencia: "",
    proximo_passo: "",
    percepcao_closer: "",
    link_gravacao: "",
    resultado_reuniao: "",
  });

  return (
    <div className="mb-3 space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Input type="datetime-local" value={s.data_reuniao} onChange={(e) => setS({ ...s, data_reuniao: e.target.value })} />
        <Select value={s.resultado_reuniao} onValueChange={(v) => setS({ ...s, resultado_reuniao: v })}>
          <SelectTrigger><SelectValue placeholder="Resultado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="avançou">Avançou</SelectItem>
            <SelectItem value="stand-by">Stand-by</SelectItem>
            <SelectItem value="objeção forte">Objeção forte</SelectItem>
            <SelectItem value="não compareceu">Não compareceu</SelectItem>
            <SelectItem value="fechou">Fechou</SelectItem>
            <SelectItem value="perdeu">Perdeu</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Textarea rows={2} placeholder="Resumo da conversa" value={s.resumo} onChange={(e) => setS({ ...s, resumo: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Dor principal" value={s.dor_principal} onChange={(e) => setS({ ...s, dor_principal: e.target.value })} />
        <Input placeholder="Objeções" value={s.objecoes} onChange={(e) => setS({ ...s, objecoes: e.target.value })} />
        <Input placeholder="Nível de urgência" value={s.nivel_urgencia} onChange={(e) => setS({ ...s, nivel_urgencia: e.target.value })} />
        <Input placeholder="Próximo passo" value={s.proximo_passo} onChange={(e) => setS({ ...s, proximo_passo: e.target.value })} />
        <Input placeholder="Percepção do closer" value={s.percepcao_closer} onChange={(e) => setS({ ...s, percepcao_closer: e.target.value })} className="col-span-2" />
        <Input placeholder="Link da gravação" value={s.link_gravacao} onChange={(e) => setS({ ...s, link_gravacao: e.target.value })} className="col-span-2" />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button
          size="sm"
          onClick={() =>
            onSubmit({
              data_reuniao: new Date(s.data_reuniao).toISOString(),
              resumo: s.resumo || null,
              dor_principal: s.dor_principal || null,
              objecoes: s.objecoes || null,
              nivel_urgencia: s.nivel_urgencia || null,
              proximo_passo: s.proximo_passo || null,
              percepcao_closer: s.percepcao_closer || null,
              link_gravacao: s.link_gravacao || null,
              resultado_reuniao: s.resultado_reuniao || null,
            })
          }
        >
          Salvar feedback
        </Button>
      </div>
    </div>
  );
}
