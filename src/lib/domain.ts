export type Temperatura = "quente" | "morno" | "frio" | "precisa_qualificacao";
export type EtapaFunil =
  | "prospectando"
  | "conectado"
  | "qualificado"
  | "call_agendada"
  | "reuniao_realizada"
  | "em_fechamento"
  | "followup"
  | "aguardando_pagamento"
  | "venda_ganha"
  | "venda_perdida";
export type SLAStatus = "em_dia" | "atencao" | "vencido" | "na";

// Hipótese de dor usada na abordagem — alinhado às 5 portas de entrada do
// Plano de Go-to-Market da ByBrain (Bloco 2/3). Obrigatório registrar por lead
// para que as taxas de conversão por dor sejam mensuráveis (Bloco 5/7).
export const HIPOTESES_DOR = [
  "Garantia de Conciliação",
  "Reestruturação Financeira",
  "Controle Orçamentário",
  "Rentabilidade",
  "Gestão de Inadimplentes",
  "Outra",
] as const;
export type HipoteseDor = (typeof HIPOTESES_DOR)[number];

export interface Lead {
  id: string;
  nome_cliente: string;
  nome_empresa: string;
  whatsapp: string;
  email: string | null;
  cargo: string | null;
  faturamento_medio: string | null;
  numero_funcionarios: string | null;
  ticket_estimado: number | null;
  temperatura: Temperatura;
  etapa_funil: EtapaFunil;
  origem: string | null;
  hipotese_dor: string | null;
  motivo_perda: string | null;
  link_reuniao: string | null;
  data_proxima_reuniao: string | null;
  data_followup: string | null;
  observacoes: string | null;
  tags: string[];
  ultima_atividade_em: string;
  created_at: string;
  updated_at: string;
}

export interface LeadFeedback {
  id: string;
  lead_id: string;
  data_reuniao: string;
  resumo: string | null;
  dor_principal: string | null;
  objecoes: string | null;
  nivel_urgencia: string | null;
  proximo_passo: string | null;
  percepcao_closer: string | null;
  link_gravacao: string | null;
  resultado_reuniao: string | null;
  created_at: string;
  updated_at: string;
}

export const ETAPAS: { id: EtapaFunil; label: string; desc: string; fase: "pre_venda" | "venda" }[] = [
  { id: "prospectando", label: "Iniciados", desc: "A conta entrou formalmente no fluxo de prospecção.", fase: "pre_venda" },
  { id: "conectado", label: "Conectados", desc: "Houve acesso real: resposta, interação ou indicação interna.", fase: "pre_venda" },
  { id: "qualificado", label: "Qualificados", desc: "Aderência suficiente entre empresa, problema e capacidade de compra.", fase: "pre_venda" },
  { id: "call_agendada", label: "Reunião agendada", desc: "Data e horário definidos.", fase: "pre_venda" },
  { id: "reuniao_realizada", label: "Reunião realizada", desc: "A conversa efetivamente aconteceu.", fase: "pre_venda" },
  { id: "em_fechamento", label: "Proposta", desc: "Proposta comercial apresentada.", fase: "venda" },
  { id: "followup", label: "Follow-up", desc: "Retomada ativa após a proposta.", fase: "venda" },
  { id: "aguardando_pagamento", label: "Aguardando pagamento", desc: "Fechamento acordado, pagamento pendente.", fase: "venda" },
  { id: "venda_ganha", label: "Ganho", desc: "Venda conquistada.", fase: "venda" },
  { id: "venda_perdida", label: "Perdido", desc: "Oportunidade encerrada sem venda.", fase: "venda" },
];

export const TEMPERATURAS: { id: Temperatura; label: string; color: string }[] = [
  { id: "quente", label: "Quente", color: "bg-hot text-white" },
  { id: "morno", label: "Morno", color: "bg-warm text-warning-foreground" },
  { id: "frio", label: "Frio", color: "bg-cold text-white" },
  { id: "precisa_qualificacao", label: "Precisa qualificação", color: "bg-neutral text-white" },
];

export const TAG_SUGESTOES = [
  "ICP Forte", "Decisor", "Alto ticket", "Precisa proposta", "Sem orçamento",
  "Urgente", "Jurídico", "Infoprodutor", "Clínica", "Escritório",
  "Agência", "Automação", "IA", "Follow-up crítico",
];

const HOUR = 60 * 60 * 1000;

export function hoursSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / HOUR;
}

export function calcSLA(lead: Lead): SLAStatus {
  const stage = lead.etapa_funil;
  if (stage === "venda_ganha" || stage === "venda_perdida") return "na";

  const idle = hoursSince(lead.ultima_atividade_em);

  if (stage === "followup") {
    if (!lead.data_followup) return idle > 24 ? "vencido" : "em_dia";
    const diffH = (new Date(lead.data_followup).getTime() - Date.now()) / HOUR;
    if (diffH < 0) return "vencido";
    if (diffH < 12) return "atencao";
    return "em_dia";
  }

  if (stage === "call_agendada") {
    if (lead.data_proxima_reuniao) {
      const diffH = (new Date(lead.data_proxima_reuniao).getTime() - Date.now()) / HOUR;
      if (diffH < 0) return "vencido";
      if (diffH < 24) return "atencao";
    }
    return idle > 48 ? "atencao" : "em_dia";
  }

  // prospectando, em_fechamento, aguardando_pagamento → 24h idle
  if (idle > 24) return "vencido";
  if (idle > 18) return "atencao";
  return "em_dia";
}

export function calcPriority(lead: Lead): number {
  if (lead.etapa_funil === "venda_ganha" || lead.etapa_funil === "venda_perdida") return 0;
  let score = 0;
  if (lead.temperatura === "quente") score += 30;
  if ((lead.ticket_estimado ?? 0) > 30000) score += 20;
  if (lead.etapa_funil === "em_fechamento") score += 20;
  if (lead.etapa_funil === "aguardando_pagamento") score += 25;
  if (lead.data_followup && new Date(lead.data_followup).getTime() < Date.now()) score += 15;
  if (hoursSince(lead.ultima_atividade_em) > 48) score += 10;
  if (lead.tags.includes("ICP Forte")) score += 20;
  return Math.min(score, 100);
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const h = hoursSince(iso);
  if (h < 1) return "agora";
  if (h < 24) return `há ${Math.floor(h)}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  return `há ${Math.floor(d / 30)}mês`;
}

export function formatCurrency(v: number | null | undefined): string {
  if (!v) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export const SLA_STYLES: Record<SLAStatus, { label: string; className: string; dot: string }> = {
  em_dia: { label: "Em dia", className: "bg-success/15 text-success border-success/30", dot: "bg-success" },
  atencao: { label: "Atenção", className: "bg-warning/20 text-warning-foreground border-warning/40", dot: "bg-warning" },
  vencido: { label: "SLA vencido", className: "bg-danger/15 text-danger border-danger/30", dot: "bg-danger" },
  na: { label: "—", className: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
};

export function tempStyle(t: Temperatura) {
  return TEMPERATURAS.find((x) => x.id === t)!;
}

export function etapaLabel(e: EtapaFunil) {
  return ETAPAS.find((x) => x.id === e)?.label ?? e;
}
