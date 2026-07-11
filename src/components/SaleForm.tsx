import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PAYMENT_METHODS, PAYMENT_STATUS, PRODUTOS_SUGERIDOS, calcCommission,
  type PaymentMethod, type PaymentStatus, type Sale,
} from "@/lib/commerce-domain";
import { useCreateSale, useUpdateSale, useLinks } from "@/lib/commerce-api";
import { useLeads, useUpdateLead } from "@/lib/leads-api";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sale?: Sale | null;
  defaultLeadId?: string | null;
}

type F = {
  lead_id: string;
  client_name: string;
  company_name: string;
  product_name: string;
  sale_value: string;
  payment_method: PaymentMethod | "";
  payment_status: PaymentStatus;
  sale_date: string;
  expected_payment_date: string;
  confirmed_payment_date: string;
  payment_link: string;
  notes: string;
  owner: string;
  commission_rate: string; // percentage
  amount_paid: string;
};

const toInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const empty = (): F => ({
  lead_id: "",
  client_name: "",
  company_name: "",
  product_name: "Implementação IA",
  sale_value: "",
  payment_method: "pix",
  payment_status: "aguardando",
  sale_date: toInput(new Date().toISOString()),
  expected_payment_date: "",
  confirmed_payment_date: "",
  payment_link: "",
  notes: "",
  owner: "",
  commission_rate: "1",
  amount_paid: "",
});

export function SaleForm({ open, onOpenChange, sale, defaultLeadId }: Props) {
  const [f, setF] = useState<F>(empty());
  const { data: leads = [] } = useLeads();
  const { data: links = [] } = useLinks();
  const create = useCreateSale();
  const update = useUpdateSale();
  const updateLead = useUpdateLead();

  const paymentLinks = useMemo(() => links.filter((l) => l.category === "pagamento"), [links]);

  useEffect(() => {
    if (!open) return;
    if (sale) {
      setF({
        lead_id: sale.lead_id ?? "",
        client_name: sale.client_name,
        company_name: sale.company_name,
        product_name: sale.product_name,
        sale_value: String(sale.sale_value ?? ""),
        payment_method: (sale.payment_method ?? "") as PaymentMethod | "",
        payment_status: sale.payment_status,
        sale_date: toInput(sale.sale_date),
        expected_payment_date: toInput(sale.expected_payment_date),
        confirmed_payment_date: toInput(sale.confirmed_payment_date),
        payment_link: sale.payment_link ?? "",
        notes: sale.notes ?? "",
        owner: sale.owner ?? "",
        commission_rate: String((sale.commission_rate ?? 0.01) * 100),
        amount_paid: sale.amount_paid ? String(sale.amount_paid) : "",
      });
    } else {
      const base = empty();
      if (defaultLeadId) {
        const lead = leads.find((l) => l.id === defaultLeadId);
        if (lead) {
          base.lead_id = lead.id;
          base.client_name = lead.nome_cliente;
          base.company_name = lead.nome_empresa;
          if (lead.ticket_estimado) base.sale_value = String(lead.ticket_estimado);
        }
      }
      setF(base);
    }
  }, [open, sale, defaultLeadId, leads]);

  const saleValueNum = Number(f.sale_value) || 0;
  const rateNum = (Number(f.commission_rate) || 0) / 100;
  const previewCommission = calcCommission(saleValueNum, rateNum, f.payment_status);

  const applyLead = (leadId: string) => {
    if (leadId === "none") {
      setF({ ...f, lead_id: "" });
      return;
    }
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    setF({
      ...f,
      lead_id: lead.id,
      client_name: f.client_name || lead.nome_cliente,
      company_name: f.company_name || lead.nome_empresa,
    });
  };

  const submit = async () => {
    if (!f.client_name || !f.company_name || !f.product_name || !f.sale_value) {
      toast.error("Preencha cliente, empresa, produto e valor");
      return;
    }
    const payload = {
      lead_id: f.lead_id || null,
      client_name: f.client_name,
      company_name: f.company_name,
      product_name: f.product_name,
      sale_value: saleValueNum,
      payment_method: f.payment_method || null,
      payment_status: f.payment_status,
      sale_date: f.sale_date ? new Date(f.sale_date).toISOString() : new Date().toISOString(),
      expected_payment_date: f.expected_payment_date ? new Date(f.expected_payment_date).toISOString() : null,
      confirmed_payment_date: f.confirmed_payment_date ? new Date(f.confirmed_payment_date).toISOString() : null,
      payment_link: f.payment_link || null,
      notes: f.notes || null,
      owner: f.owner || null,
      commission_rate: rateNum,
      commission_value: previewCommission,
      amount_paid: f.amount_paid ? Number(f.amount_paid) : (f.payment_status === "pago" ? saleValueNum : 0),
    };
    try {
      let savedId: string;
      if (sale) {
        const r = await update.mutateAsync({ id: sale.id, patch: payload });
        savedId = r.id;
        toast.success("Venda atualizada");
      } else {
        const r = await create.mutateAsync(payload);
        savedId = r.id;
        toast.success("Venda criada");
      }
      // sugerir mover lead para "venda_ganha" se pago
      if (payload.lead_id && payload.payment_status === "pago") {
        const lead = leads.find((l) => l.id === payload.lead_id);
        if (lead && lead.etapa_funil !== "venda_ganha") {
          if (confirm(`Mover lead "${lead.nome_cliente}" para "Venda ganha"?`)) {
            await updateLead.mutateAsync({ id: lead.id, patch: { etapa_funil: "venda_ganha" } });
          }
        }
      }
      onOpenChange(false);
      void savedId;
    } catch (e) {
      toast.error("Erro ao salvar", { description: (e as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{sale ? "Editar venda" : "Nova venda"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lead relacionado" className="col-span-2">
            <Select value={f.lead_id || "none"} onValueChange={applyLead}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome_cliente} · {l.nome_empresa}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cliente *">
            <Input value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} />
          </Field>
          <Field label="Empresa *">
            <Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} />
          </Field>
          <Field label="Produto / serviço *">
            <Select value={f.product_name} onValueChange={(v) => setF({ ...f, product_name: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUTOS_SUGERIDOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Valor da venda (R$) *">
            <Input type="number" step="0.01" value={f.sale_value} onChange={(e) => setF({ ...f, sale_value: e.target.value })} />
          </Field>
          <Field label="Forma de pagamento">
            <Select value={f.payment_method || "none"} onValueChange={(v) => setF({ ...f, payment_method: v === "none" ? "" : (v as PaymentMethod) })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status do pagamento *">
            <Select value={f.payment_status} onValueChange={(v) => setF({ ...f, payment_status: v as PaymentStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_STATUS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data da venda">
            <Input type="date" value={f.sale_date} onChange={(e) => setF({ ...f, sale_date: e.target.value })} />
          </Field>
          <Field label="Prev. de pagamento">
            <Input type="date" value={f.expected_payment_date} onChange={(e) => setF({ ...f, expected_payment_date: e.target.value })} />
          </Field>
          <Field label="Pagamento confirmado em">
            <Input type="date" value={f.confirmed_payment_date} onChange={(e) => setF({ ...f, confirmed_payment_date: e.target.value })} />
          </Field>
          <Field label="Valor pago (R$)">
            <Input type="number" step="0.01" value={f.amount_paid} onChange={(e) => setF({ ...f, amount_paid: e.target.value })} placeholder="Deixe vazio para automático" />
          </Field>
          <Field label="Taxa de comissão (%)">
            <Input type="number" step="0.01" value={f.commission_rate} onChange={(e) => setF({ ...f, commission_rate: e.target.value })} />
          </Field>
          <Field label="Responsável">
            <Input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} placeholder="Closer" />
          </Field>
          <Field label="Link de pagamento (Central de Links)" className="col-span-2">
            <Select value={f.payment_link || "manual"} onValueChange={(v) => setF({ ...f, payment_link: v === "manual" ? f.payment_link : v })}>
              <SelectTrigger><SelectValue placeholder="Selecionar da Central..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">— digitar manualmente —</SelectItem>
                {paymentLinks.map((l) => <SelectItem key={l.id} value={l.url}>{l.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="mt-2" value={f.payment_link} onChange={(e) => setF({ ...f, payment_link: e.target.value })} placeholder="https://..." />
          </Field>
          <Field label="Observações" className="col-span-2">
            <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </Field>
          <div className="col-span-2 rounded-md border bg-muted/50 p-3 text-sm">
            Comissão calculada:{" "}
            <strong className="text-foreground">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(previewCommission)}
            </strong>
            <span className="ml-2 text-xs text-muted-foreground">
              ({Number(f.commission_rate || 0)}% sobre {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(saleValueNum)})
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {sale ? "Salvar" : "Criar venda"}
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
