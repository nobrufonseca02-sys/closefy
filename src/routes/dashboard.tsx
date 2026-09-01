import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LeadForm } from "@/components/LeadForm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Handshake, Package, TrendingDown, TrendingUp, UserPlus } from "lucide-react";
import { useLeads } from "@/lib/leads-api";
import { useSales } from "@/lib/commerce-api";
import { formatBRL } from "@/lib/commerce-domain";
import { relativeTime } from "@/lib/domain";

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
  const [formOpen, setFormOpen] = useState(false);

  const stats = useMemo(() => {
    const active = leads.filter((l) => l.etapa_funil !== "venda_ganha" && l.etapa_funil !== "venda_perdida");
    const quentes = active.filter((l) => l.temperatura === "quente");
    const ganhas = leads.filter((l) => l.etapa_funil === "venda_ganha");
    return { active, quentes, ganhas };
  }, [leads]);

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

  // Atividade recente: só fatos novos (lead cadastrado, venda registrada) —
  // sem log de movimentação entre etapas.
  const recentActivity = useMemo(() => {
    type Item = { key: string; at: string; kind: "lead" | "sale"; title: string; subtitle: string };
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
  }, [leads, sales]);

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
                        (item.kind === "lead" ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600")
                      }
                    >
                      {item.kind === "lead" ? <UserPlus className="size-3.5" /> : <DollarSign className="size-3.5" />}
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

      <LeadForm open={formOpen} onOpenChange={setFormOpen} />
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
