import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LeadForm } from "@/components/LeadForm";
import { LeadDetail } from "@/components/LeadDetail";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TagBadge } from "@/components/TagBadge";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, Clock, DollarSign, Flame, Handshake, History, Package,
  Target, TrendingDown, TrendingUp, Trophy, UserPlus, Wallet,
} from "lucide-react";
import { useLeads } from "@/lib/leads-api";
import { useSales } from "@/lib/commerce-api";
import { useRecentLeadHistory, type LeadHistoryEntry } from "@/lib/tag-catalog-api";
import { formatBRL } from "@/lib/commerce-domain";
import {
  etapaLabel, formatCurrency, formatDate, relativeTime, tempStyle, type Lead,
} from "@/lib/domain";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard | Closefy" }],
  }),
  component: DashboardPage,
});

// --- Comparação mês atual x mês anterior, usada nos cards de KPI ---

function monthRange(monthsAgo: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 1);
  return { start: start.getTime(), end: end.getTime() };
}

function inRange(iso: string, start: number, end: number) {
  const t = new Date(iso).getTime();
  return t >= start && t < end;
}

interface Delta {
  text: string;
  tone: "up" | "down" | "neutral";
}

function buildDelta(curr: number, prev: number): Delta {
  if (prev === 0) {
    if (curr === 0) return { text: "Sem variação vs mês passado", tone: "neutral" };
    return { text: "Novo neste mês", tone: "up" };
  }
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(0)}% vs mês passado`, tone: pct >= 0 ? "up" : "down" };
}

function DashboardPage() {
  const { data: leads = [] } = useLeads();
  const { data: sales = [] } = useSales();
  const { data: history = [] } = useRecentLeadHistory(15);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<Lead | null>(null);

  const stats = useMemo(() => {
    const active = leads.filter((l) => l.etapa_funil !== "venda_ganha" && l.etapa_funil !== "venda_perdida");
    const quentes = active.filter((l) => l.temperatura === "quente");
    const pagamento = leads.filter((l) => l.etapa_funil === "aguardando_pagamento");
    const ganhas = leads.filter((l) => l.etapa_funil === "venda_ganha");
    const pipeline = active.reduce((s, l) => s + (l.ticket_estimado ?? 0), 0);
    const proximasCalls = active
      .filter((l) => l.data_proxima_reuniao && new Date(l.data_proxima_reuniao).getTime() > Date.now())
      .sort((a, b) => new Date(a.data_proxima_reuniao!).getTime() - new Date(b.data_proxima_reuniao!).getTime());

    return { active, quentes, pagamento, ganhas, pipeline, proximasCalls };
  }, [leads]);

  const salesStats = useMemo(() => {
    const valid = sales.filter((s) => s.payment_status !== "cancelado" && s.payment_status !== "reembolsado");
    const totalSold = valid.reduce((a, s) => a + Number(s.sale_value), 0);
    const totalReceived = sales.reduce((a, s) => a + Number(s.amount_paid || (s.payment_status === "pago" ? s.sale_value : 0)), 0);
    const totalPending = valid
      .filter((s) => s.payment_status === "aguardando" || s.payment_status === "parcial" || s.payment_status === "inadimplente")
      .reduce((a, s) => a + Number(s.sale_value) - Number(s.amount_paid || 0), 0);
    const commissionPredicted = valid.reduce((a, s) => a + Number(s.commission_value), 0);
    const commissionConfirmed = valid
      .filter((s) => s.payment_status === "pago")
      .reduce((a, s) => a + Number(s.commission_value), 0);
    const paidCount = valid.filter((s) => s.payment_status === "pago").length;
    const avgTicket = paidCount > 0 ? totalReceived / paidCount : 0;
    return { totalSold, totalReceived, totalPending, commissionPredicted, commissionConfirmed, paidCount, avgTicket, count: valid.length };
  }, [sales]);

  // KPIs do topo: sempre mês corrente vs mês anterior, com dado real dos dois lados.
  const kpis = useMemo(() => {
    const cur = monthRange(0);
    const prev = monthRange(1);
    const validSales = sales.filter((s) => s.payment_status !== "cancelado" && s.payment_status !== "reembolsado");

    const curSales = validSales.filter((s) => inRange(s.sale_date, cur.start, cur.end));
    const prevSales = validSales.filter((s) => inRange(s.sale_date, prev.start, prev.end));
    const curRevenue = curSales.reduce((a, s) => a + Number(s.sale_value), 0);
    const prevRevenue = prevSales.reduce((a, s) => a + Number(s.sale_value), 0);

    const curLeads = leads.filter((l) => inRange(l.created_at, cur.start, cur.end));
    const prevLeads = leads.filter((l) => inRange(l.created_at, prev.start, prev.end));

    const curTicket = curSales.length > 0 ? curRevenue / curSales.length : 0;
    const prevTicket = prevSales.length > 0 ? prevRevenue / prevSales.length : 0;

    return {
      revenue: { value: curRevenue, delta: buildDelta(curRevenue, prevRevenue) },
      newLeads: { value: curLeads.length, delta: buildDelta(curLeads.length, prevLeads.length) },
      closedSales: { value: curSales.length, delta: buildDelta(curSales.length, prevSales.length) },
      avgTicket: { value: curTicket, delta: buildDelta(curTicket, prevTicket) },
    };
  }, [leads, sales]);

  // Barras de "Estatísticas rápidas" — todas percentuais reais (0-100), sem invenção.
  const quickStats = useMemo(() => {
    const conversao = leads.length > 0 ? (stats.ganhas.length / leads.length) * 100 : 0;
    const validSales = sales.filter((s) => s.payment_status !== "cancelado" && s.payment_status !== "reembolsado");
    const pagas = validSales.length > 0
      ? (validSales.filter((s) => s.payment_status === "pago").length / validSales.length) * 100
      : 0;
    const quentesPct = stats.active.length > 0 ? (stats.quentes.length / stats.active.length) * 100 : 0;
    return { conversao, pagas, quentesPct };
  }, [leads, sales, stats]);

  // Ranking de produtos por receita — direto dos registros de venda, sem dado fictício.
  const topProducts = useMemo(() => {
    const totals = new Map<string, number>();
    sales.forEach((s) => {
      if (s.payment_status === "cancelado" || s.payment_status === "reembolsado") return;
      totals.set(s.product_name, (totals.get(s.product_name) ?? 0) + Number(s.sale_value));
    });
    return Array.from(totals.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [sales]);

  // Feed de atividade: novos leads + mudanças de etapa + vendas registradas,
  // cada fonte já vem do banco — só mescla por data e corta no topo N.
  const recentActivity = useMemo(() => {
    const leadMap = new Map(leads.map((l) => [l.id, l]));
    type Item = { key: string; at: string; kind: "lead" | "stage" | "sale"; title: string; subtitle: string };
    const items: Item[] = [];

    leads.slice(0, 8).forEach((l) => {
      items.push({
        key: `lead-${l.id}`,
        at: l.created_at,
        kind: "lead",
        title: "Novo lead cadastrado",
        subtitle: `${l.nome_cliente} · ${l.nome_empresa}`,
      });
    });

    history.forEach((h: LeadHistoryEntry) => {
      const lead = leadMap.get(h.lead_id);
      items.push({
        key: `hist-${h.id}`,
        at: h.created_at,
        kind: "stage",
        title: "Mudança de etapa",
        subtitle: `${lead?.nome_cliente ?? "Lead"}: ${h.from_stage ? etapaLabel(h.from_stage as Lead["etapa_funil"]) : "—"} → ${etapaLabel(h.to_stage as Lead["etapa_funil"])}`,
      });
    });

    [...sales]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8)
      .forEach((s) => {
        items.push({
          key: `sale-${s.id}`,
          at: s.created_at,
          kind: "sale",
          title: "Venda registrada",
          subtitle: `${s.client_name} · ${formatBRL(Number(s.sale_value))}`,
        });
      });

    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 6);
  }, [leads, sales, history]);

  const detailLive = detail ? leads.find((l) => l.id === detail.id) ?? null : null;

  return (
    <AppShell onNewLead={() => setFormOpen(true)}>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Dashboard comercial</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          icon={<DollarSign className="size-4" />}
          color="blue"
          label="Total vendido (mês)"
          value={formatBRL(kpis.revenue.value)}
          delta={kpis.revenue.delta}
        />
        <KpiCard
          icon={<UserPlus className="size-4" />}
          color="green"
          label="Novos leads (mês)"
          value={kpis.newLeads.value}
          delta={kpis.newLeads.delta}
        />
        <KpiCard
          icon={<Handshake className="size-4" />}
          color="purple"
          label="Vendas fechadas (mês)"
          value={kpis.closedSales.value}
          delta={kpis.closedSales.delta}
        />
        <KpiCard
          icon={<Package className="size-4" />}
          color="orange"
          label="Ticket médio (mês)"
          value={formatBRL(kpis.avgTicket.value)}
          delta={kpis.avgTicket.delta}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Atividade recente</h3>
              <Badge variant="secondary">{recentActivity.length}</Badge>
            </div>
            {recentActivity.length === 0 ? (
              <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                Nenhuma atividade ainda
              </div>
            ) : (
              <ul className="divide-y">
                {recentActivity.map((item) => (
                  <li key={item.key} className="flex items-center gap-3 py-2.5">
                    <div
                      className={
                        "grid size-8 shrink-0 place-items-center rounded-full " +
                        (item.kind === "lead" ? "bg-green-100 text-green-600"
                          : item.kind === "sale" ? "bg-blue-100 text-blue-600"
                          : "bg-purple-100 text-purple-600")
                      }
                    >
                      {item.kind === "lead" && <UserPlus className="size-3.5" />}
                      {item.kind === "sale" && <DollarSign className="size-3.5" />}
                      {item.kind === "stage" && <History className="size-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{item.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(item.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 font-semibold">Estatísticas rápidas</h3>
              <div className="flex flex-col gap-3">
                <QuickStatRow
                  label="Taxa de conversão"
                  valueLabel={`${quickStats.conversao.toFixed(1)}%`}
                  pct={quickStats.conversao}
                  barClassName="bg-primary"
                />
                <QuickStatRow
                  label="Vendas pagas"
                  valueLabel={`${quickStats.pagas.toFixed(0)}%`}
                  pct={quickStats.pagas}
                  barClassName="bg-success"
                />
                <QuickStatRow
                  label="Leads quentes no pipeline"
                  valueLabel={`${quickStats.quentesPct.toFixed(0)}%`}
                  pct={quickStats.quentesPct}
                  barClassName="bg-hot"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 font-semibold">Produtos mais vendidos</h3>
              {topProducts.length === 0 ? (
                <div className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground">
                  Nenhuma venda ainda
                </div>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {topProducts.map((p) => (
                    <li key={p.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-muted-foreground">{p.name}</span>
                      <span className="shrink-0 font-medium">{formatBRL(p.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pipeline</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Target className="size-4" />} label="Leads ativos" value={stats.active.length} />
        <Stat icon={<Flame className="size-4 text-hot" />} label="Leads quentes" value={stats.quentes.length} />
        <Stat icon={<Wallet className="size-4" />} label="Aguardando pagamento" value={stats.pagamento.length} />
        <Stat icon={<DollarSign className="size-4" />} label="Pipeline potencial" value={formatCurrency(stats.pipeline)} />
        <Stat icon={<Trophy className="size-4 text-success" />} label="Vendas ganhas" value={stats.ganhas.length} tone="success" />
      </div>

      <h2 className="mt-6 mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Financeiro</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<DollarSign className="size-4" />} label="Total vendido" value={formatBRL(salesStats.totalSold)} />
        <Stat icon={<Wallet className="size-4 text-success" />} label="Total recebido" value={formatBRL(salesStats.totalReceived)} tone="success" />
        <Stat icon={<Clock className="size-4 text-warning-foreground" />} label="Aguardando pagamento" value={formatBRL(salesStats.totalPending)} tone="warning" />
        <Stat icon={<Trophy className="size-4" />} label="Ticket médio" value={formatBRL(salesStats.avgTicket)} />
        <Stat icon={<DollarSign className="size-4" />} label="Comissão prevista" value={formatBRL(salesStats.commissionPredicted)} />
        <Stat icon={<DollarSign className="size-4 text-success" />} label="Comissão confirmada" value={formatBRL(salesStats.commissionConfirmed)} tone="success" />
        <Stat icon={<Trophy className="size-4" />} label="Vendas do período" value={salesStats.count} />
        <Stat icon={<Wallet className="size-4" />} label="Leads aguardando pgto" value={stats.pagamento.length} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
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

const KPI_COLORS = {
  blue: "bg-blue-100 text-blue-600",
  green: "bg-green-100 text-green-600",
  purple: "bg-purple-100 text-purple-600",
  orange: "bg-orange-100 text-orange-600",
} as const;

function KpiCard({
  icon, color, label, value, delta,
}: {
  icon: React.ReactNode;
  color: keyof typeof KPI_COLORS;
  label: string;
  value: number | string;
  delta: Delta;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={`grid size-9 place-items-center rounded-lg ${KPI_COLORS[color]}`}>{icon}</div>
          {delta.tone !== "neutral" && (
            delta.tone === "up"
              ? <TrendingUp className="size-4 text-success" />
              : <TrendingDown className="size-4 text-danger" />
          )}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        <div
          className={
            "mt-1 text-xs font-medium " +
            (delta.tone === "up" ? "text-success" : delta.tone === "down" ? "text-danger" : "text-muted-foreground")
          }
        >
          {delta.text}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickStatRow({
  label, valueLabel, pct, barClassName,
}: {
  label: string;
  valueLabel: string;
  pct: number;
  barClassName: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{valueLabel}</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${barClassName}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
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
  title, description, items, onOpen, showDate, empty,
}: {
  title: string;
  description?: string;
  items: Lead[];
  onOpen: (l: Lead) => void;
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
                          <TagBadge key={t} name={t} />
                        ))}
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onOpen(l)}>
                    <ArrowRight className="size-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
