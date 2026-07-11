import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LeadForm } from "@/components/LeadForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useStoredLinks, useStoredSales } from "@/lib/commercial-storage";
import { useLeads } from "@/lib/leads-api";
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PRODUCT_OPTIONS,
  applyLeadToSale,
  buildSaleRecord,
  emptySaleDraft,
  formatBRL,
  formatDateBR,
  normalizeExternalUrl,
  type PaymentMethod,
  type PaymentStatus,
  type ProductName,
  type SaleDraft,
  type SaleRecord,
} from "@/lib/commercial";
import { CalendarClock, Copy, DollarSign, ExternalLink, Pencil, Plus, ShoppingCart, Target, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/vendas")({
  head: () => ({
    meta: [{ title: "Vendas | HighTicket Closer" }],
  }),
  component: SalesPage,
});

type QuickFilter = "all" | "paid" | "waiting" | "canceled" | "highest_value" | "highest_commission";

const quickFilters: Array<{ id: QuickFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "paid", label: "Vendas pagas" },
  { id: "waiting", label: "Aguardando pagamento" },
  { id: "canceled", label: "Canceladas" },
  { id: "highest_value", label: "Maior valor" },
  { id: "highest_commission", label: "Maior comissão" },
];

function SalesPage() {
  const { data: leads = [] } = useLeads();
  const { links } = useStoredLinks();
  const { sales, setSales } = useStoredSales();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SaleDraft>(() => emptySaleDraft());
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "all">("all");
  const [productFilter, setProductFilter] = useState<ProductName | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  const paymentLinks = useMemo(() => links.filter((link) => link.category === "Pagamento"), [links]);

  const summary = useMemo(() => {
    const validSales = sales.filter((sale) => !["Cancelado", "Reembolsado"].includes(sale.paymentStatus));
    const paidSales = sales.filter((sale) => sale.paymentStatus === "Pago");
    const totalReceived = sales.reduce((sum, sale) => {
      if (sale.paymentStatus === "Pago") return sum + sale.saleValue;
      if (sale.paymentStatus === "Parcialmente pago") return sum + sale.amountPaid;
      return sum;
    }, 0);

    return {
      totalSold: validSales.reduce((sum, sale) => sum + sale.saleValue, 0),
      totalReceived,
      awaitingPayment: sales.filter((sale) => sale.paymentStatus === "Aguardando pagamento").reduce((sum, sale) => sum + sale.saleValue, 0),
      totalCommission: sales.reduce((sum, sale) => sum + sale.commissionValue, 0),
      paidCommission: paidSales.reduce((sum, sale) => sum + sale.commissionValue, 0),
      awaitingCount: sales.filter((sale) => sale.paymentStatus === "Aguardando pagamento").length,
      averageTicket: validSales.length ? validSales.reduce((sum, sale) => sum + sale.saleValue, 0) / validSales.length : 0,
      wonCount: paidSales.length,
    };
  }, [sales]);

  const filteredSales = useMemo(() => {
    const owner = normalize(ownerFilter);
    const filtered = sales.filter((sale) => {
      if (statusFilter !== "all" && sale.paymentStatus !== statusFilter) return false;
      if (productFilter !== "all" && sale.productName !== productFilter) return false;
      if (owner && !normalize(sale.owner).includes(owner)) return false;
      if (startDate && dateValue(sale.saleDate) < dateValue(startDate)) return false;
      if (endDate && dateValue(sale.saleDate) > dateValue(endDate)) return false;
      if (quickFilter === "paid" && sale.paymentStatus !== "Pago") return false;
      if (quickFilter === "waiting" && sale.paymentStatus !== "Aguardando pagamento") return false;
      if (quickFilter === "canceled" && !["Cancelado", "Reembolsado"].includes(sale.paymentStatus)) return false;
      return true;
    });

    if (quickFilter === "highest_value") return [...filtered].sort((a, b) => b.saleValue - a.saleValue);
    if (quickFilter === "highest_commission") return [...filtered].sort((a, b) => b.commissionValue - a.commissionValue);
    return [...filtered].sort((a, b) => dateValue(b.saleDate) - dateValue(a.saleDate));
  }, [endDate, ownerFilter, productFilter, quickFilter, sales, startDate, statusFilter]);

  function saveSale() {
    if (!form.clientName.trim() || !form.productName || form.saleValue <= 0) {
      toast.error("Informe cliente, produto/serviço e valor da venda.");
      return;
    }

    const existing = editingId ? sales.find((sale) => sale.id === editingId) : undefined;
    const next = buildSaleRecord(form, existing);
    setSales((current) => (existing ? current.map((sale) => (sale.id === existing.id ? next : sale)) : [next, ...current]));
    setEditingId(null);
    setForm(emptySaleDraft());
    toast.success(
      next.paymentStatus === "Pago" && next.leadId
        ? "Venda salva. Você pode mover o lead para Venda ganha no Kanban."
        : existing
          ? "Venda atualizada."
          : "Venda cadastrada.",
    );
  }

  function editSale(sale: SaleRecord) {
    setEditingId(sale.id);
    setForm({
      leadId: sale.leadId,
      clientName: sale.clientName,
      companyName: sale.companyName,
      productName: sale.productName,
      saleValue: sale.saleValue,
      paymentMethod: sale.paymentMethod,
      paymentStatus: sale.paymentStatus,
      saleDate: sale.saleDate,
      expectedPaymentDate: sale.expectedPaymentDate,
      confirmedPaymentDate: sale.confirmedPaymentDate,
      paymentLink: sale.paymentLink,
      notes: sale.notes,
      owner: sale.owner,
      commissionRate: sale.commissionRate,
      amountPaid: sale.amountPaid,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteSale(id: string) {
    setSales((current) => current.filter((sale) => sale.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setForm(emptySaleDraft());
    }
    toast.success("Venda excluída.");
  }

  function updateLead(leadId: string) {
    const lead = leads.find((item) => item.id === leadId);
    setForm((current) => applyLeadToSale(current, lead));
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("Link de pagamento copiado.");
  }

  return (
    <AppShell onNewLead={() => setFormOpen(true)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Vendas e Comissões</h1>
          <p className="text-sm text-muted-foreground">Controle de vendas realizadas e comissão padrão de 1%.</p>
        </div>
        <Button className="gap-2" onClick={saveSale}>
          <Plus className="size-4" /> {editingId ? "Salvar venda" : "Nova Venda"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<DollarSign className="size-4" />} label="Total vendido" value={formatBRL(summary.totalSold)} />
        <Stat icon={<DollarSign className="size-4" />} label="Total recebido" value={formatBRL(summary.totalReceived)} />
        <Stat icon={<CalendarClock className="size-4" />} label="Total aguardando pagamento" value={formatBRL(summary.awaitingPayment)} tone="warning" />
        <Stat icon={<Target className="size-4" />} label="Total de comissão gerada" value={formatBRL(summary.totalCommission)} />
        <Stat icon={<Target className="size-4" />} label="Comissão sobre vendas pagas" value={formatBRL(summary.paidCommission)} />
        <Stat icon={<CalendarClock className="size-4" />} label="Vendas aguardando pagamento" value={summary.awaitingCount} tone="warning" />
        <Stat icon={<ShoppingCart className="size-4" />} label="Ticket médio" value={formatBRL(summary.averageTicket)} />
        <Stat icon={<Trophy className="size-4" />} label="Quantidade de vendas ganhas" value={summary.wonCount} tone="success" />
      </div>

      <Card className="mt-4">
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Lead relacionado">
            <Select value={form.leadId || "none"} onValueChange={(value) => updateLead(value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Sem lead" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem lead</SelectItem>
                {leads.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.nome_cliente} - {lead.nome_empresa}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cliente">
            <Input aria-label="Cliente" value={form.clientName} onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))} />
          </Field>
          <Field label="Empresa">
            <Input aria-label="Empresa" value={form.companyName} onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))} />
          </Field>
          <Field label="Produto/serviço">
            <Select value={form.productName} onValueChange={(value) => setForm((current) => ({ ...current, productName: value as ProductName }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRODUCT_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Valor da venda">
            <Input aria-label="Valor da venda" type="number" min="0" step="0.01" value={form.saleValue} onChange={(event) => setForm((current) => ({ ...current, saleValue: Number(event.target.value) }))} />
          </Field>
          <Field label="Forma de pagamento">
            <Select value={form.paymentMethod} onValueChange={(value) => setForm((current) => ({ ...current, paymentMethod: value as PaymentMethod }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Status do pagamento">
            <Select value={form.paymentStatus} onValueChange={(value) => setForm((current) => ({ ...current, paymentStatus: value as PaymentStatus }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_STATUSES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Data da venda">
            <Input aria-label="Data da venda" type="date" value={form.saleDate} onChange={(event) => setForm((current) => ({ ...current, saleDate: event.target.value }))} />
          </Field>
          <Field label="Data prevista pagamento">
            <Input aria-label="Data prevista pagamento" type="date" value={form.expectedPaymentDate} onChange={(event) => setForm((current) => ({ ...current, expectedPaymentDate: event.target.value }))} />
          </Field>
          <Field label="Data pagamento confirmado">
            <Input aria-label="Data pagamento confirmado" type="date" value={form.confirmedPaymentDate} onChange={(event) => setForm((current) => ({ ...current, confirmedPaymentDate: event.target.value }))} />
          </Field>
          <Field label="Responsável">
            <Input aria-label="Responsável" value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} />
          </Field>
          <Field label="Comissão %">
            <Input aria-label="Comissão %" type="number" min="0" step="0.01" value={form.commissionRate} onChange={(event) => setForm((current) => ({ ...current, commissionRate: Number(event.target.value) }))} />
          </Field>
          <Field label="Valor pago">
            <Input aria-label="Valor pago" type="number" min="0" step="0.01" value={form.amountPaid} onChange={(event) => setForm((current) => ({ ...current, amountPaid: Number(event.target.value) }))} />
          </Field>
          <Field label="Usar link de pagamento">
            <Select value="none" onValueChange={(value) => setForm((current) => ({ ...current, paymentLink: value === "none" ? current.paymentLink : value }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar link" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Selecionar link</SelectItem>
                {paymentLinks.map((link) => <SelectItem key={link.id} value={link.url}>{link.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-2 md:col-span-2">
            <Label>Link de pagamento</Label>
            <Input aria-label="Link de pagamento" value={form.paymentLink} onChange={(event) => setForm((current) => ({ ...current, paymentLink: event.target.value }))} placeholder="https://..." />
          </div>
          <div className="grid gap-2 md:col-span-2 xl:col-span-4">
            <Label>Observações</Label>
            <Textarea aria-label="Observações" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as PaymentStatus | "all")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {PAYMENT_STATUSES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={productFilter} onValueChange={(value) => setProductFilter(value as ProductName | "all")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            {PRODUCT_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} placeholder="Responsável" />
        <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Data inicial" />
        <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="Data final" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {quickFilters.map((item) => (
          <Button key={item.id} variant={quickFilter === item.id ? "secondary" : "outline"} size="sm" onClick={() => setQuickFilter(item.id)}>
            {item.label}
          </Button>
        ))}
      </div>

      <Card className="mt-4">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Produto/serviço</TableHead>
                <TableHead>Valor da venda</TableHead>
                <TableHead>Status do pagamento</TableHead>
                <TableHead>Data da venda</TableHead>
                <TableHead>Forma de pagamento</TableHead>
                <TableHead>Comissão %</TableHead>
                <TableHead>Valor da comissão</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Link de pagamento</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.map((sale) => (
                <TableRow key={sale.id} className={rowTone(sale.paymentStatus)}>
                  <TableCell className="font-medium">{sale.clientName}</TableCell>
                  <TableCell>{sale.companyName || "—"}</TableCell>
                  <TableCell>{sale.productName}</TableCell>
                  <TableCell>{formatBRL(sale.saleValue)}</TableCell>
                  <TableCell><Badge className={statusTone(sale.paymentStatus)}>{sale.paymentStatus}</Badge></TableCell>
                  <TableCell>{formatDateBR(sale.saleDate)}</TableCell>
                  <TableCell>{sale.paymentMethod}</TableCell>
                  <TableCell>{sale.commissionRate}%</TableCell>
                  <TableCell>{formatBRL(sale.commissionValue)}</TableCell>
                  <TableCell>{sale.owner || "—"}</TableCell>
                  <TableCell>
                    {sale.paymentLink ? (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" title="Copiar link" onClick={() => copyLink(sale.paymentLink)}><Copy className="size-4" /></Button>
                        <Button variant="ghost" size="icon" title="Abrir link" onClick={() => window.open(normalizeExternalUrl(sale.paymentLink), "_blank", "noopener,noreferrer")}><ExternalLink className="size-4" /></Button>
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" title="Editar venda" onClick={() => editSale(sale)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Excluir venda" onClick={() => deleteSale(sale.id)}><Trash2 className="size-4 text-danger" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredSales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="h-28 text-center text-muted-foreground">Nenhuma venda encontrada.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LeadForm open={formOpen} onOpenChange={setFormOpen} />
    </AppShell>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone?: "warning" | "success" }) {
  const toneCls = tone === "warning" ? "border-warning/40 bg-warning/5" : tone === "success" ? "border-success/40 bg-success/5" : "";
  return (
    <Card className={toneCls}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
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

function statusTone(status: PaymentStatus): string {
  if (status === "Pago") return "bg-success text-success-foreground";
  if (status === "Cancelado" || status === "Reembolsado") return "bg-danger text-danger-foreground";
  if (status === "Parcialmente pago") return "bg-cold text-white";
  return "bg-warning text-warning-foreground";
}

function rowTone(status: PaymentStatus): string {
  if (status === "Pago") return "border-l-4 border-l-success";
  if (status === "Cancelado" || status === "Reembolsado") return "border-l-4 border-l-danger";
  if (status === "Parcialmente pago") return "border-l-4 border-l-cold";
  return "border-l-4 border-l-warning";
}

function dateValue(value: string): number {
  if (!value) return 0;
  return new Date(`${value}T00:00:00`).getTime() || 0;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
