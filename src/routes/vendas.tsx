import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SaleForm } from "@/components/SaleForm";
import { useSales, useDeleteSale } from "@/lib/commerce-api";
import { formatBRL, PAYMENT_STATUS, statusStyle, type PaymentStatus, type Sale } from "@/lib/commerce-domain";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Pencil, Trash2, Search, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/vendas")({
  component: VendasPage,
  head: () => ({ meta: [{ title: "Vendas e Comissões · Closefy" }] }),
});

const PAID_STATUSES: PaymentStatus[] = ["pago"];
const PENDING_STATUSES: PaymentStatus[] = ["aguardando", "parcial", "inadimplente"];

function VendasPage() {
  const { data: sales = [] } = useSales();
  const del = useDeleteSale();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | PaymentStatus>("all");
  const [produto, setProduto] = useState<string>("all");
  const [owner, setOwner] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "value" | "commission">("recent");

  const owners = useMemo(() => Array.from(new Set(sales.map((s) => s.owner).filter(Boolean))) as string[], [sales]);
  const produtos = useMemo(() => Array.from(new Set(sales.map((s) => s.product_name))), [sales]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let arr = sales.filter((s) => {
      if (status !== "all" && s.payment_status !== status) return false;
      if (produto !== "all" && s.product_name !== produto) return false;
      if (owner !== "all" && s.owner !== owner) return false;
      if (query) {
        const hay = `${s.client_name} ${s.company_name} ${s.product_name} ${s.owner ?? ""}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    if (sortBy === "value") arr = [...arr].sort((a, b) => Number(b.sale_value) - Number(a.sale_value));
    else if (sortBy === "commission") arr = [...arr].sort((a, b) => Number(b.commission_value) - Number(a.commission_value));
    return arr;
  }, [sales, q, status, produto, owner, sortBy]);

  const kpi = useMemo(() => {
    const totalSold = sales.reduce((a, s) => a + Number(s.sale_value), 0);
    const totalReceived = sales.reduce((a, s) => a + Number(s.amount_paid || (s.payment_status === "pago" ? s.sale_value : 0)), 0);
    const pending = sales.filter((s) => PENDING_STATUSES.includes(s.payment_status));
    const totalPending = pending.reduce((a, s) => a + Number(s.sale_value) - Number(s.amount_paid || 0), 0);
    const totalCommission = sales.reduce((a, s) => a + Number(s.commission_value), 0);
    const paidCommission = sales.filter((s) => PAID_STATUSES.includes(s.payment_status))
      .reduce((a, s) => a + Number(s.commission_value), 0);
    const wonCount = sales.filter((s) => PAID_STATUSES.includes(s.payment_status)).length;
    const avgTicket = wonCount > 0 ? totalReceived / wonCount : 0;
    return { totalSold, totalReceived, totalPending, totalCommission, paidCommission, pendingCount: pending.length, wonCount, avgTicket };
  }, [sales]);

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (s: Sale) => { setEditing(s); setOpen(true); };
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success("Link copiado"); }
    catch { toast.error("Não foi possível copiar"); }
  };
  const remove = async (s: Sale) => {
    if (!confirm(`Excluir venda de "${s.client_name}"?`)) return;
    await del.mutateAsync(s.id);
    toast.success("Venda excluída");
  };

  const exportCSV = () => {
    const rows = [
      ["Cliente", "Empresa", "Produto", "Valor", "Status", "Data", "Forma", "Comissão %", "Comissão", "Responsável", "Link"],
      ...filtered.map((s) => [
        s.client_name, s.company_name, s.product_name,
        String(s.sale_value), s.payment_status,
        new Date(s.sale_date).toLocaleDateString("pt-BR"),
        s.payment_method ?? "",
        String((Number(s.commission_rate) * 100).toFixed(2)),
        String(s.commission_value),
        s.owner ?? "",
        s.payment_link ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vendas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <AppShell primaryAction={{ label: "Nova Venda", onClick: openNew }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendas e Comissões</h1>
          <p className="text-sm text-muted-foreground">Registre vendas, acompanhe pagamentos e comissões (padrão 1%).</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
          <Download className="size-4" /> Exportar CSV
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total vendido" value={formatBRL(kpi.totalSold)} />
        <Kpi label="Total recebido" value={formatBRL(kpi.totalReceived)} accent="success" />
        <Kpi label="Aguardando pagamento" value={formatBRL(kpi.totalPending)} accent="warning" sub={`${kpi.pendingCount} venda(s)`} />
        <Kpi label="Ticket médio (pago)" value={formatBRL(kpi.avgTicket)} sub={`${kpi.wonCount} vendas ganhas`} />
        <Kpi label="Comissão gerada" value={formatBRL(kpi.totalCommission)} />
        <Kpi label="Comissão de vendas pagas" value={formatBRL(kpi.paidCommission)} accent="success" />
        <Kpi label="Comissão pendente" value={formatBRL(kpi.totalCommission - kpi.paidCommission)} accent="warning" />
        <Kpi label="Total de vendas" value={String(sales.length)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, empresa, produto..." className="pl-8" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {PAYMENT_STATUS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={produto} onValueChange={setProduto}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Produto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos produtos</SelectItem>
            {produtos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recentes</SelectItem>
            <SelectItem value="value">Maior valor</SelectItem>
            <SelectItem value="commission">Maior comissão</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Empresa</th>
              <th className="px-3 py-2 text-left">Produto</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Forma</th>
              <th className="px-3 py-2 text-right">Comissão</th>
              <th className="px-3 py-2 text-left">Resp.</th>
              <th className="px-3 py-2 text-left">Link</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">Nenhuma venda registrada.</td></tr>
            ) : filtered.map((s) => {
              const st = statusStyle(s.payment_status);
              return (
                <tr key={s.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{s.client_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.company_name}</td>
                  <td className="px-3 py-2">{s.product_name}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatBRL(Number(s.sale_value))}</td>
                  <td className="px-3 py-2"><Badge className={st.className} variant="outline">{st.label}</Badge></td>
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(s.sale_date).toLocaleDateString("pt-BR")}</td>
                  <td className="px-3 py-2 capitalize">{s.payment_method ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="font-medium">{formatBRL(Number(s.commission_value))}</div>
                    <div className="text-[10px] text-muted-foreground">{(Number(s.commission_rate) * 100).toFixed(2)}%</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.owner ?? "—"}</td>
                  <td className="px-3 py-2">
                    {s.payment_link ? (
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => copy(s.payment_link!)}><Copy className="size-3.5" /></Button>
                        <Button size="icon" variant="ghost" asChild><a href={s.payment_link} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /></a></Button>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="size-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(s)}><Trash2 className="size-4" /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SaleForm open={open} onOpenChange={setOpen} sale={editing} />
    </AppShell>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "success" | "warning" }) {
  const cls = accent === "success" ? "text-success" : accent === "warning" ? "text-warning-foreground" : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"mt-1 text-xl font-bold " + cls}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
