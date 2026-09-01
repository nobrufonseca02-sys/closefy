export type LinkCategory =
  | "pagamento"
  | "planilha"
  | "reuniao"
  | "proposta"
  | "contrato"
  | "whatsapp"
  | "material"
  | "documento"
  | "dashboard"
  | "outro";

export interface ImportantLink {
  id: string;
  title: string;
  url: string;
  category: LinkCategory;
  description: string | null;
  client_name: string | null;
  company_name: string | null;
  lead_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export const LINK_CATEGORIES: { id: LinkCategory; label: string }[] = [
  { id: "pagamento", label: "Pagamento" },
  { id: "planilha", label: "Planilha" },
  { id: "reuniao", label: "Reunião" },
  { id: "proposta", label: "Proposta" },
  { id: "contrato", label: "Contrato" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "material", label: "Material Comercial" },
  { id: "documento", label: "Documento" },
  { id: "dashboard", label: "Dashboard" },
  { id: "outro", label: "Outro" },
];

export type PaymentStatus =
  | "aguardando"
  | "pago"
  | "parcial"
  | "cancelado"
  | "reembolsado"
  | "inadimplente";

export type PaymentMethod =
  | "pix"
  | "cartao"
  | "boleto"
  | "transferencia"
  | "parcelado"
  | "outro";

export interface Sale {
  id: string;
  lead_id: string | null;
  client_name: string;
  company_name: string;
  product_name: string;
  sale_value: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  sale_date: string;
  expected_payment_date: string | null;
  confirmed_payment_date: string | null;
  payment_link: string | null;
  notes: string | null;
  owner: string | null;
  commission_rate: number;
  commission_value: number;
  amount_paid: number;
  created_at: string;
  updated_at: string;
}

export const PAYMENT_STATUS: { id: PaymentStatus; label: string; className: string }[] = [
  { id: "aguardando", label: "Aguardando", className: "bg-warning/20 text-warning-foreground border-warning/40" },
  { id: "pago", label: "Pago", className: "bg-success/15 text-success border-success/30" },
  { id: "parcial", label: "Parcial", className: "bg-primary/10 text-primary border-primary/30" },
  { id: "cancelado", label: "Cancelado", className: "bg-muted text-muted-foreground border-border" },
  { id: "reembolsado", label: "Reembolsado", className: "bg-muted text-muted-foreground border-border" },
  { id: "inadimplente", label: "Inadimplente", className: "bg-danger/15 text-danger border-danger/30" },
];

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "pix", label: "PIX" },
  { id: "cartao", label: "Cartão" },
  { id: "boleto", label: "Boleto" },
  { id: "transferencia", label: "Transferência" },
  { id: "parcelado", label: "Parcelado" },
  { id: "outro", label: "Outro" },
];

export const PRODUTOS_SUGERIDOS = [
  "Implementação IA",
  "Implementação Automação",
  "Mentoria",
  "Consultoria",
  "SaaS",
  "Setup",
  "Outro",
];

export function formatBRL(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

// Alíquota de impostos/deduções aplicada sobre o valor da venda antes do
// cálculo da comissão — a comissão incide sobre o valor líquido, não sobre
// o valor bruto vendido.
export const COMMISSION_TAX_RATE = 0.16;

export function calcNetSaleValue(saleValue: number): number {
  return saleValue * (1 - COMMISSION_TAX_RATE);
}

export function calcCommission(saleValue: number, rate: number, status: PaymentStatus): number {
  if (status === "cancelado" || status === "reembolsado") return 0;
  const net = calcNetSaleValue(saleValue);
  return Math.round(net * rate * 100) / 100;
}

export function statusStyle(s: PaymentStatus) {
  return PAYMENT_STATUS.find((x) => x.id === s) ?? PAYMENT_STATUS[0];
}

export function linkCategoryLabel(c: LinkCategory) {
  return LINK_CATEGORIES.find((x) => x.id === c)?.label ?? c;
}
