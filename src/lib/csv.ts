import type { EtapaFunil, Lead, Temperatura } from "./domain";

/**
 * Minimal, dependency-free CSV parser. Handles comma separators, double-quote
 * enclosed fields (with "" escaping), and both CRLF/LF line endings. Good
 * enough for exports from Excel/Google Sheets — not a full RFC 4180 parser.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\r") {
      // skip, \n handles the line break
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  // last row (file may or may not end with a newline)
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const VALID_TEMPERATURAS: Temperatura[] = ["quente", "morno", "frio", "precisa_qualificacao"];
const VALID_ETAPAS: EtapaFunil[] = [
  "prospectando", "conectado", "qualificado", "call_agendada",
  "reuniao_realizada", "em_fechamento", "followup", "aguardando_pagamento",
  "venda_ganha", "venda_perdida",
];

export interface CsvImportResult {
  valid: Partial<Lead>[];
  errors: { line: number; reason: string }[];
}

/**
 * Maps a parsed CSV (with header row) into insertable lead payloads.
 * Expected header names match the `leads` table columns exactly; unknown
 * columns are ignored, missing optional columns default to null.
 */
export function mapCsvToLeads(rows: string[][]): CsvImportResult {
  const errors: CsvImportResult["errors"] = [];
  if (rows.length === 0) return { valid: [], errors: [{ line: 0, reason: "Arquivo vazio" }] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const get = (r: string[], name: string) => {
    const i = idx(name);
    return i === -1 ? "" : (r[i] ?? "").trim();
  };

  const valid: Partial<Lead>[] = [];

  for (let li = 1; li < rows.length; li++) {
    const r = rows[li];
    const line = li + 1; // 1-based, header is line 1
    const nome_cliente = get(r, "nome_cliente");
    const nome_empresa = get(r, "nome_empresa");
    const whatsapp = get(r, "whatsapp");

    if (!nome_cliente || !nome_empresa || !whatsapp) {
      errors.push({ line, reason: "Faltando nome_cliente, nome_empresa ou whatsapp (obrigatórios)" });
      continue;
    }

    const temperaturaRaw = get(r, "temperatura").toLowerCase() as Temperatura;
    const temperatura: Temperatura = VALID_TEMPERATURAS.includes(temperaturaRaw)
      ? temperaturaRaw
      : "precisa_qualificacao";

    const etapaRaw = get(r, "etapa_funil").toLowerCase() as EtapaFunil;
    const etapa_funil: EtapaFunil = VALID_ETAPAS.includes(etapaRaw) ? etapaRaw : "prospectando";

    const ticketRaw = get(r, "ticket_estimado").replace(/[^\d.,-]/g, "").replace(",", ".");
    const ticket_estimado = ticketRaw ? Number(ticketRaw) || 0 : 0;

    const tagsRaw = get(r, "tags");
    const tags = tagsRaw ? tagsRaw.split("|").map((t) => t.trim()).filter(Boolean) : [];

    valid.push({
      nome_cliente,
      nome_empresa,
      whatsapp,
      email: get(r, "email") || null,
      cargo: get(r, "cargo") || null,
      faturamento_medio: get(r, "faturamento_medio") || null,
      numero_funcionarios: get(r, "numero_funcionarios") || null,
      ticket_estimado,
      temperatura,
      etapa_funil,
      origem: get(r, "origem") || null,
      hipotese_dor: get(r, "hipotese_dor") || null,
      tags,
    });
  }

  return { valid, errors };
}
