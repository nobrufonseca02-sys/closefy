import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LeadForm } from "@/components/LeadForm";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowRight, Clock, DollarSign, Flame, Target, Trophy, Wallet } from "lucide-react";
import { useLeads } from "@/lib/leads-api";
import { useSales } from "@/lib/commerce-api";
import { formatBRL } from "@/lib/commerce-domain";
import { formatCurrency } from "@/lib/domain";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard | Closefy" }],
  }),
  component: DashboardPage,
});

// --- Comparação mês atual x mês anterior, usada nos badges de variação ---

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
  tone: "up" | "down";
}

function buildDelta(curr: number, prev: number): Delta | undefined {
  if (prev === 0) return curr === 0 ? undefined : { text: "Novo no mês", tone: "up" };
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(0)}%`, tone: pct >= 0 ? "up" : "down" };
}

function DashboardPage() {
  const { data: leads = [] } = useLeads();
  const { data: sales = [] } = useSales();
  const [formOpen, setFormOpen] = useState(false);

  const stats = useMemo(() => {
    const active = leads.filter((l) => l.etapa_funil !== "venda_ganha" && l.etapa_funil !== "venda_perdida");
    const quentes = active.filter((l) => l.temperatura === "quente");
    const pagamento = leads.filter((l) => l.etapa_funil === "aguardando_pagamento");
    const ganhas = leads.filter((l) => l.etapa_funil === "venda_ganha");
    const pipeline = active.reduce((s, l) => s + (l.ticket_estimado ?? 0), 0);
    return { active, quentes, pagamento, ganhas, pipeline };
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

  // Variação mês atual x mês anterior — só pros números que dá pra comparar
  // de forma honesta com o dado que já temos (sale_date / created_at).
  // Cards sem contrapartida temporal confiável (ex.: "Leads ativos" é uma
  // foto do agora, "Total recebido" mistura datas de venda e de pagamento)
  // ficam sem badge, em vez de mostrar uma variação inventada.
  const deltas = useMemo(() => {
    const cur = monthRange(0);
    const prev = monthRange(1);
    const validSales = sales.filter((s) => s.payment_status !== "cancelado" && s.payment_status !== "reembolsado");
    const curSales = validSales.filter((s) => inRange(s.sale_date, cur.start, cur.end));
    const prevSales = validSales.filter((s) => inRange(s.sale_date, prev.start, prev.end));
    const paidCur = curSales.filter((s) => s.payment_status === "pago");
    const paidPrev = prevSales.filter((s) => s.payment_status === "pago");

    const sum = (arr: typeof sales, field: "sale_value" | "commission_value") =>
      arr.reduce((a, s) => a + Number(s[field]), 0);

    const curTicket = curSales.length > 0 ? sum(curSales, "sale_value") / curSales.length : 0;
    const prevTicket = prevSales.length > 0 ? sum(prevSales, "sale_value") / prevSales.length : 0;

    const curNewLeads = leads.filter((l) => inRange(l.created_at, cur.start, cur.end)).length;
    const prevNewLeads = leads.filter((l) => inRange(l.created_at, prev.start, prev.end)).length;

    return {
      leadsAtivos: buildDelta(curNewLeads, prevNewLeads),
      totalVendido: buildDelta(sum(curSales, "sale_value"), sum(prevSales, "sale_value")),
      ticketMedio: buildDelta(curTicket, prevTicket),
      comissaoPrevista: buildDelta(sum(curSales, "commission_value"), sum(prevSales, "commission_value")),
      comissaoConfirmada: buildDelta(sum(paidCur, "commission_value"), sum(paidPrev, "commission_value")),
      vendasPeriodo: buildDelta(curSales.length, prevSales.length),
    };
  }, [leads, sales]);

  return (
    <AppShell onNewLead={() => setFormOpen(true)}>
      <h1 className="mb-5 text-xl font-semibold tracking-tight">Dashboard comercial</h1>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pipeline</h2>
        <Link to="/" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/90">
          Ver leads <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={<Target className="size-3.5" />} label="Leads ativos" value={stats.active.length} delta={deltas.leadsAtivos} />
        <StatCard icon={<Flame className="size-3.5" />} label="Leads quentes" value={stats.quentes.length} tone="hot" />
        <StatCard icon={<Wallet className="size-3.5" />} label="Aguardando pagamento" value={stats.pagamento.length} />
        <StatCard icon={<DollarSign className="size-3.5" />} label="Pipeline potencial" value={formatCurrency(stats.pipeline)} />
        <StatCard icon={<Trophy className="size-3.5" />} label="Vendas ganhas" value={stats.ganhas.length} tone="success" />
      </div>

      <div className="mt-7 mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financeiro</h2>
        <Link to="/vendas" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/90">
          Ver vendas <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<DollarSign className="size-3.5" />} label="Total vendido" value={formatBRL(salesStats.totalSold)} delta={deltas.totalVendido} />
        <StatCard icon={<Wallet className="size-3.5" />} label="Total recebido" value={formatBRL(salesStats.totalReceived)} tone="success" />
        <StatCard icon={<Clock className="size-3.5" />} label="Aguardando pagamento" value={formatBRL(salesStats.totalPending)} tone="warning" />
        <StatCard icon={<Trophy className="size-3.5" />} label="Ticket médio" value={formatBRL(salesStats.avgTicket)} delta={deltas.ticketMedio} />
        <StatCard icon={<DollarSign className="size-3.5" />} label="Comissão prevista" value={formatBRL(salesStats.commissionPredicted)} delta={deltas.comissaoPrevista} />
        <StatCard icon={<DollarSign className="size-3.5" />} label="Comissão confirmada" value={formatBRL(salesStats.commissionConfirmed)} tone="success" delta={deltas.comissaoConfirmada} />
        <StatCard icon={<Trophy className="size-3.5" />} label="Vendas do período" value={salesStats.count} delta={deltas.vendasPeriodo} />
        <StatCard icon={<Wallet className="size-3.5" />} label="Leads aguardando pgto" value={stats.pagamento.length} />
      </div>

      <LeadForm open={formOpen} onOpenChange={setFormOpen} />
    </AppShell>
  );
}

const TONE_STYLES: Record<"success" | "warning" | "danger" | "hot" | "default", { card: string; icon: string }> = {
  success: { card: "border-success/30 bg-success/5", icon: "text-success" },
  warning: { card: "border-warning/40 bg-warning/10", icon: "text-warning-foreground" },
  danger: { card: "border-danger/30 bg-danger/5", icon: "text-danger" },
  hot: { card: "", icon: "text-hot" },
  default: { card: "", icon: "" },
};

function StatCard({
  icon, label, value, delta, tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  delta?: Delta;
  tone?: keyof typeof TONE_STYLES;
}) {
  const t = TONE_STYLES[tone];
  return (
    <Card className={cn("gap-0 py-0", t.card)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
            <span className={t.icon}>{icon}</span> <span className="truncate">{label}</span>
          </span>
          {delta && (
            <span
              className={cn(
                "shrink-0 text-xs font-medium",
                delta.tone === "up" ? "text-success" : "text-danger",
              )}
            >
              {delta.text}
            </span>
          )}
        </div>
        <div className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
