import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LeadForm } from "@/components/LeadForm";
import { LeadDetail } from "@/components/LeadDetail";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, Clock, DollarSign, Flame, Handshake, Snowflake, Target, Trophy, Wallet } from "lucide-react";
import { useLeads } from "@/lib/leads-api";
import {
  SLA_STYLES, calcPriority, calcSLA, etapaLabel, formatCurrency,
  formatDate, hoursSince, relativeTime, tempStyle, type Lead,
} from "@/lib/domain";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard | HighTicket Closer" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: leads = [] } = useLeads();
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<Lead | null>(null);

  const stats = useMemo(() => {
    const active = leads.filter((l) => l.etapa_funil !== "venda_ganha" && l.etapa_funil !== "venda_perdida");
    const quentes = active.filter((l) => l.temperatura === "quente");
    const fechamento = leads.filter((l) => l.etapa_funil === "em_fechamento");
    const pagamento = leads.filter((l) => l.etapa_funil === "aguardando_pagamento");
    const ganhas = leads.filter((l) => l.etapa_funil === "venda_ganha");
    const fuVencidos = active.filter((l) => l.data_followup && new Date(l.data_followup).getTime() < Date.now());
    const semAtendimento = active.filter((l) => hoursSince(l.ultima_atividade_em) > 48);
    const pipeline = active.reduce((s, l) => s + (l.ticket_estimado ?? 0), 0);
    const proximasCalls = active
      .filter((l) => l.data_proxima_reuniao && new Date(l.data_proxima_reuniao).getTime() > Date.now())
      .sort((a, b) => new Date(a.data_proxima_reuniao!).getTime() - new Date(b.data_proxima_reuniao!).getTime());

    return { active, quentes, fechamento, pagamento, ganhas, fuVencidos, semAtendimento, pipeline, proximasCalls };
  }, [leads]);

  const detailLive = detail ? leads.find((l) => l.id === detail.id) ?? null : null;

  return (
    <AppShell onNewLead={() => setFormOpen(true)}>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Dashboard comercial</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Target className="size-4" />} label="Leads ativos" value={stats.active.length} />
        <Stat icon={<Flame className="size-4 text-hot" />} label="Leads quentes" value={stats.quentes.length} />
        <Stat icon={<Handshake className="size-4" />} label="Em fechamento" value={stats.fechamento.length} />
        <Stat icon={<Wallet className="size-4" />} label="Aguardando pagamento" value={stats.pagamento.length} />
        <Stat icon={<AlertTriangle className="size-4 text-danger" />} label="Follow-ups vencidos" value={stats.fuVencidos.length} tone="danger" />
        <Stat icon={<Snowflake className="size-4" />} label="Sem atendimento >48h" value={stats.semAtendimento.length} tone="warning" />
        <Stat icon={<DollarSign className="size-4" />} label="Pipeline potencial" value={formatCurrency(stats.pipeline)} />
        <Stat icon={<Trophy className="size-4 text-success" />} label="Vendas ganhas" value={stats.ganhas.length} tone="success" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PriorityList
          title="Prioridade máxima"
          description="Ordenado pelo score comercial"
          items={[...stats.active].sort((a, b) => calcPriority(b) - calcPriority(a)).slice(0, 8)}
          onOpen={setDetail}
          showScore
        />
        <PriorityList
          title="Leads mais quentes"
          items={stats.quentes.slice(0, 8)}
          onOpen={setDetail}
        />
        <PriorityList
          title="Follow-ups vencidos"
          items={stats.fuVencidos.slice(0, 8)}
          onOpen={setDetail}
          empty="Nenhum follow-up vencido 🎉"
        />
        <PriorityList
          title="Sem atendimento há muito tempo"
          items={stats.semAtendimento.slice(0, 8)}
          onOpen={setDetail}
        />
        <PriorityList
          title="Em fechamento"
          items={stats.fechamento}
          onOpen={setDetail}
        />
        <PriorityList
          title="Aguardando pagamento"
          items={stats.pagamento}
          onOpen={setDetail}
        />
        <PriorityList
          title="Próximas calls agendadas"
          items={stats.proximasCalls.slice(0, 8)}
          onOpen={setDetail}
          showDate
        />
      </div>

      <LeadForm open={formOpen} onOpenChange={setFormOpen} />
      <LeadDetail lead={detailLive} onOpenChange={(o) => !o && setDetail(null)} onEdit={() => {}} />
    </AppShell>
  );
}

function Stat({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "danger" | "warning" | "success";
}) {
  const toneCls =
    tone === "danger" ? "border-danger/40 bg-danger/5"
    : tone === "warning" ? "border-warning/40 bg-warning/5"
    : tone === "success" ? "border-success/40 bg-success/5"
    : "";
  return (
    <Card className={toneCls}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon} {label}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function PriorityList({
  title, description, items, onOpen, showScore, showDate, empty,
}: {
  title: string;
  description?: string;
  items: Lead[];
  onOpen: (l: Lead) => void;
  showScore?: boolean;
  showDate?: boolean;
  empty?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <div>
            <h3 className="font-semibold">{title}</h3>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            {empty ?? "Nada por aqui"}
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((l) => {
              const t = tempStyle(l.temperatura);
              const sla = calcSLA(l);
              return (
                <li key={l.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{l.nome_cliente}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${t.color}`}>{t.label}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="truncate">{l.nome_empresa}</span>
                      <span>·</span>
                      <span>{etapaLabel(l.etapa_funil)}</span>
                      <span>·</span>
                      <span>{formatCurrency(l.ticket_estimado)}</span>
                      {showDate && l.data_proxima_reuniao && (<>
                        <span>·</span>
                        <span>{formatDate(l.data_proxima_reuniao)}</span>
                      </>)}
                      {!showDate && (<>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5"><Clock className="size-3" />{relativeTime(l.ultima_atividade_em)}</span>
                      </>)}
                    </div>
                    {l.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {l.tags.slice(0, 4).map((t) => (
                          <Badge key={t} variant="outline" className="h-4 px-1 text-[10px] font-normal">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {showScore && (
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                        {calcPriority(l)}
                      </span>
                    )}
                    {sla !== "na" && (
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${SLA_STYLES[sla].className}`}>
                        {SLA_STYLES[sla].label}
                      </span>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onOpen(l)}>
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
