import type { Lead } from "./domain";

export const LINK_CATEGORIES = [
  "Pagamento",
  "Planilha",
  "Reunião",
  "Proposta",
  "Contrato",
  "WhatsApp",
  "Material Comercial",
  "Documento",
  "Dashboard",
  "Outro",
] as const;

export const PRODUCT_OPTIONS = [
  "Implementação IA",
  "Implementação Automação",
  "Mentoria",
  "Consultoria",
  "SaaS",
  "Setup",
  "Outro",
] as const;

export const PAYMENT_STATUSES = [
  "Aguardando pagamento",
  "Pago",
  "Parcialmente pago",
  "Cancelado",
  "Reembolsado",
  "Inadimplente",
] as const;

export const PAYMENT_METHODS = ["PIX", "Cartão", "Boleto", "Transferência", "Parcelado", "Outro"] as const;

export type LinkCategory = (typeof LINK_CATEGORIES)[number];
export type ProductName = (typeof PRODUCT_OPTIONS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface ImportantLink {
  id: string;
  title: string;
  url: string;
  category: LinkCategory;
  description: string;
  clientName: string;
  companyName: string;
  leadId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SaleRecord {
  id: string;
  leadId: string;
  clientName: string;
  companyName: string;
  productName: ProductName;
  saleValue: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  saleDate: string;
  expectedPaymentDate: string;
  confirmedPaymentDate: string;
  paymentLink: string;
  notes: string;
  owner: string;
  commissionRate: number;
  commissionValue: number;
  amountPaid: number;
  createdAt: string;
  updatedAt: string;
}

export type ImportantLinkDraft = Omit<ImportantLink, "id" | "createdAt" | "updatedAt">;
export type SaleDraft = Omit<SaleRecord, "id" | "commissionValue" | "createdAt" | "updatedAt">;

export const emptyLinkDraft: ImportantLinkDraft = {
  title: "",
  url: "",
  category: "Pagamento",
  description: "",
  clientName: "",
  companyName: "",
  leadId: "",
  tags: [],
};

export function emptySaleDraft(): SaleDraft {
  return {
    leadId: "",
    clientName: "",
    companyName: "",
    productName: "Implementação IA",
    saleValue: 0,
    paymentMethod: "PIX",
    paymentStatus: "Aguardando pagamento",
    saleDate: new Date().toISOString().slice(0, 10),
    expectedPaymentDate: "",
    confirmedPaymentDate: "",
    paymentLink: "",
    notes: "",
    owner: "",
    commissionRate: 1,
    amountPaid: 0,
  };
}

export function calculateCommission(
  saleValue: number,
  commissionRate: number,
  paymentStatus: PaymentStatus,
  amountPaid = 0,
): number {
  if (paymentStatus === "Cancelado" || paymentStatus === "Reembolsado") return 0;
  const baseValue = paymentStatus === "Parcialmente pago" && amountPaid > 0 ? amountPaid : saleValue;
  return roundMoney(baseValue * (commissionRate / 100));
}

export function buildImportantLink(draft: ImportantLinkDraft, existing?: ImportantLink): ImportantLink {
  const now = new Date().toISOString();
  return {
    ...draft,
    id: existing?.id ?? crypto.randomUUID(),
    tags: normalizeTags(draft.tags),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function buildSaleRecord(draft: SaleDraft, existing?: SaleRecord): SaleRecord {
  const saleValue = Number(draft.saleValue) || 0;
  const amountPaid = Number(draft.amountPaid) || 0;
  const commissionRate = Number(draft.commissionRate) || 0;
  const now = new Date().toISOString();

  return {
    ...draft,
    id: existing?.id ?? crypto.randomUUID(),
    saleValue,
    amountPaid,
    commissionRate,
    commissionValue: calculateCommission(saleValue, commissionRate, draft.paymentStatus, amountPaid),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function parseTags(value: string): string[] {
  return normalizeTags(value.split(","));
}

export function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

export function formatBRL(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatDateBR(value: string): string {
  if (!value) return "—";
  const date = value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function applyLeadToLink(draft: ImportantLinkDraft, lead?: Lead): ImportantLinkDraft {
  if (!lead) return { ...draft, leadId: "" };
  return {
    ...draft,
    leadId: lead.id,
    clientName: lead.nome_cliente || draft.clientName,
    companyName: lead.nome_empresa || draft.companyName,
  };
}

export function applyLeadToSale(draft: SaleDraft, lead?: Lead): SaleDraft {
  if (!lead) return { ...draft, leadId: "" };
  return {
    ...draft,
    leadId: lead.id,
    clientName: lead.nome_cliente || draft.clientName,
    companyName: lead.nome_empresa || draft.companyName,
  };
}

export function normalizeExternalUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
