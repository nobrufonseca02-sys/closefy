import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AppShell } from "@/components/AppShell";
import { LeadForm } from "@/components/LeadForm";
import { LeadDetail } from "@/components/LeadDetail";
import { LeadCard } from "@/components/LeadCard";
import { SaleForm } from "@/components/SaleForm";
import { ImportLeadsDialog } from "@/components/ImportLeadsDialog";
import { FiltersBar, defaultFilters, type FiltersState } from "@/components/FiltersBar";
import { useLeads, useUpdateLead, leadsKey } from "@/lib/leads-api";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useSales } from "@/lib/commerce-api";
import { recordLeadHistory } from "@/lib/tag-catalog-api";
import { ETAPAS, calcSLA, type EtapaFunil, type Lead } from "@/lib/domain";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: KanbanPage,
});

function KanbanPage() {
  const { data: leads = [], isLoading } = useLeads();
  const { data: sales = [] } = useSales();
  const update = useUpdateLead();
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [defaultStage, setDefaultStage] = useState<EtapaFunil | undefined>();
  const [detail, setDetail] = useState<Lead | null>(null);
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<EtapaFunil | "">("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Sale-on-drop pending state
  const [pendingSale, setPendingSale] = useState<{ lead: Lead; fromStage: EtapaFunil } | null>(null);
  // Standalone "Registrar compra" state (from card action)
  const [saleForLead, setSaleForLead] = useState<Lead | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const pendingSaleSaved = useRef(false);

  // Click-and-drag panning for the horizontal Kanban scroller — grab anywhere
  // on the board background (not a card, not a button) and drag left/right,
  // no scrollbar needed. Uses native Pointer Events + setPointerCapture on the
  // scroller itself (rather than window-level mousemove/mouseup) so the drag
  // keeps receiving events reliably regardless of dnd-kit's own pointer
  // sensors running in the same tree.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pan = useRef({ startX: 0, startScrollLeft: 0 });

  const onPanPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Block-list, not allow-list: panning starts from anywhere on the board
    // EXCEPT cards and interactive controls, since the scroller wraps everything
    // and an allow-list check via closest() would always match the outer div.
    if ((e.target as HTMLElement).closest("[data-no-pan], button, a, input, textarea, select")) return;
    const el = scrollerRef.current;
    if (!el) return;
    pan.current = { startX: e.clientX, startScrollLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
    el.classList.add("cursor-grabbing");
  };

  const onPanPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el || !el.hasPointerCapture(e.pointerId)) return;
    el.scrollLeft = pan.current.startScrollLeft - (e.clientX - pan.current.startX);
  };

  const onPanPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    el.classList.remove("cursor-grabbing");
  };

  const allTags = useMemo(() => {
    const s = new Set<string>();
    leads.forEach((l) => l.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return leads.filter((l) => {
      if (filters.temperatura !== "all" && l.temperatura !== filters.temperatura) return false;
      if (filters.tag && !l.tags.includes(filters.tag)) return false;
      if (filters.slaVencido && calcSLA(l) !== "vencido") return false;
      if (q) {
        const hay = `${l.nome_cliente} ${l.nome_empresa} ${l.whatsapp} ${l.email ?? ""} ${l.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, filters]);

  const detailLive = detail ? leads.find((l) => l.id === detail.id) ?? null : null;
  const draggingLead = draggingId ? leads.find((l) => l.id === draggingId) : null;

  const moveLead = async (lead: Lead, to: EtapaFunil) => {
    const from = lead.etapa_funil;
    if (from === to) return;
    try {
      await update.mutateAsync({ id: lead.id, patch: { etapa_funil: to } });
      await recordLeadHistory(lead.id, from, to, "Kanban drag");
      toast.success(`Movido para ${ETAPAS.find((x) => x.id === to)?.label}`);
    } catch (e) {
      toast.error("Não foi possível salvar. O lead permaneceu na etapa anterior.", {
        description: (e as Error).message,
      });
    }
  };

  const onDragStart = (e: DragStartEvent) => setDraggingId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDraggingId(null);
    const stage = e.over?.id as EtapaFunil | undefined;
    const leadId = e.active.id as string;
    if (!stage) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.etapa_funil === stage) return;

    // Intercept drop into "venda_ganha" — require sale registration
    if (stage === "venda_ganha") {
      setPendingSale({ lead, fromStage: lead.etapa_funil });
      return;
    }
    void moveLead(lead, stage);
  };

  const openNew = (stage?: EtapaFunil) => {
    setEditing(null);
    setDefaultStage(stage);
    setFormOpen(true);
  };

  const selectedLeads = filtered.filter((l) => selectedIds.has(l.id));

  const toggleLead = (id: string) =>
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleColumn = (ids: string[], allSelected: boolean) =>
    setSelectedIds((cur) => {
      const next = new Set(cur);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });

  const runBulkMove = async () => {
    if (!bulkTarget || selectedLeads.length === 0) return;
    setBulkBusy(true);
    const ids = selectedLeads.map((l) => l.id);
    const label = ETAPAS.find((x) => x.id === bulkTarget)?.label;
    try {
      // Uma única chamada em lote (em vez de uma por lead) — move a coluna inteira
      // praticamente instantaneamente. O histórico vai em um único insert.
      const { error } = await supabase
        .from("leads")
        .update({ etapa_funil: bulkTarget } as never)
        .in("id", ids);
      if (error) throw error;

      await supabase.from("lead_history" as never).insert(
        selectedLeads.map((l) => ({
          lead_id: l.id,
          from_stage: l.etapa_funil,
          to_stage: bulkTarget,
          note: "Migração em massa",
        })) as never,
      );

      await qc.invalidateQueries({ queryKey: leadsKey });
      toast.success(`${ids.length} lead(s) movidos para ${label}`);
      setSelectedIds(new Set());
      setBulkTarget("");
    } catch (e) {
      toast.error("Não foi possível migrar a coluna.", { description: (e as Error).message });
    } finally {
      setBulkBusy(false);
    }
  };


  return (
    <AppShell onNewLead={() => openNew()} onImportCsv={() => setImportOpen(true)}>
      <FiltersBar value={filters} onChange={setFilters} allTags={allTags} />

      {selectedLeads.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{selectedLeads.length} lead(s) selecionados</span>
          <select
            value={bulkTarget}
            onChange={(e) => setBulkTarget(e.target.value as EtapaFunil)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="">Mover para…</option>
            {ETAPAS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={() => void runBulkMove()}
            disabled={!bulkTarget || bulkBusy}
            className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {bulkBusy ? "Movendo..." : "Mover selecionados"}
          </button>
          <button
            onClick={() => { setSelectedIds(new Set()); setBulkTarget(""); }}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Limpar seleção
          </button>
        </div>
      )}



      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div
          ref={scrollerRef}
          onPointerDown={onPanPointerDown}
          onPointerMove={onPanPointerMove}
          onPointerUp={onPanPointerEnd}
          onPointerCancel={onPanPointerEnd}
          className="cursor-grab touch-pan-y overflow-x-auto pb-4 select-none"
        >
          <div className="flex w-max gap-3">
            {ETAPAS.map((stage) => {
              const items = filtered.filter((l) => l.etapa_funil === stage.id);
              return (
                <Column
                  key={stage.id}
                  id={stage.id}
                  label={stage.label}
                  desc={stage.desc}
                  fase={stage.fase}
                  count={items.length}
                  onAdd={() => openNew(stage.id)}
                  selected={items.length > 0 && items.every((l) => selectedIds.has(l.id))}
                  onToggleSelect={() =>
                    toggleColumn(
                      items.map((l) => l.id),
                      items.length > 0 && items.every((l) => selectedIds.has(l.id)),
                    )
                  }
                >
                  {items.map((l) => (
                    <LeadCard
                      key={l.id}
                      lead={l}
                      onOpen={setDetail}
                      onRegisterSale={(lead) => setSaleForLead(lead)}
                      selected={selectedIds.has(l.id)}
                      onToggleSelected={(lead) => toggleLead(lead.id)}
                    />
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
                      Vazio
                    </div>
                  )}
                </Column>
              );
            })}
          </div>
          <div className="mt-2 flex w-max gap-3">
            <div className="flex w-[1448px] shrink-0 flex-col items-center">
              <div className="h-2 w-full rounded-b-md border-x-2 border-b-2 border-primary/40" />
              <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                Responsabilidade do pré-vendedor
              </span>
            </div>
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {draggingLead ? (
            <div className="w-[260px] rotate-1 rounded-lg border bg-card p-3 shadow-lg">
              <div className="text-sm font-semibold">{draggingLead.nome_cliente}</div>
              <div className="text-xs text-muted-foreground">{draggingLead.nome_empresa}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {isLoading && <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>}

      <LeadForm open={formOpen} onOpenChange={setFormOpen} lead={editing} defaultStage={defaultStage} />
      <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} />
      <LeadDetail
        lead={detailLive}
        onOpenChange={(o) => !o && setDetail(null)}
        onEdit={(l) => { setEditing(l); setDefaultStage(undefined); setFormOpen(true); setDetail(null); }}
      />

      {/* Register-sale intercept when dropping into "Venda ganha" */}
      <SaleForm
        open={!!pendingSale}
        onOpenChange={(o) => {
          if (!o) {
            if (pendingSaleSaved.current) {
              pendingSaleSaved.current = false;
            } else if (pendingSale) {
              toast.info("Movimentação cancelada. O lead permanece na etapa anterior.");
            }
            setPendingSale(null);
          }
        }}
        defaultLeadId={pendingSale?.lead.id ?? null}
        onSaved={async (sale) => {
          if (!pendingSale) return;
          pendingSaleSaved.current = true;
          const status = sale.payment_status;
          let target: EtapaFunil = pendingSale.fromStage;
          if (status === "pago") target = "venda_ganha";
          else if (status === "aguardando" || status === "parcial") target = "aguardando_pagamento";
          else if (status === "cancelado" || status === "reembolsado") target = pendingSale.fromStage;
          await moveLead(pendingSale.lead, target);
        }}
      />

      {/* Standalone "Registrar compra" from card menu */}
      <SaleForm
        open={!!saleForLead}
        onOpenChange={(o) => !o && setSaleForLead(null)}
        defaultLeadId={saleForLead?.id ?? null}
        onSaved={async (sale) => {
          if (!saleForLead) return;
          if (sale.payment_status === "pago" && saleForLead.etapa_funil !== "venda_ganha") {
            await moveLead(saleForLead, "venda_ganha");
          } else if (
            (sale.payment_status === "aguardando" || sale.payment_status === "parcial") &&
            saleForLead.etapa_funil !== "aguardando_pagamento" &&
            saleForLead.etapa_funil !== "venda_ganha"
          ) {
            await moveLead(saleForLead, "aguardando_pagamento");
          }
          setSaleForLead(null);
        }}
      />

      {/* Prevent unused-var warning for sales */}
      <span className="hidden">{sales.length}</span>
    </AppShell>
  );
}

function Column({
  id, label, desc, fase, count, children, onAdd, selected, onToggleSelect,
}: {
  id: string;
  label: string;
  desc?: string;
  fase?: "pre_venda" | "venda";
  count: number;
  children: React.ReactNode;
  onAdd: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      className={
        "flex w-[280px] shrink-0 flex-col rounded-xl " +
        (selected ? "ring-2 ring-primary bg-primary/10 " : "") +
        (fase === "pre_venda" ? "bg-primary/5 ring-1 ring-primary/15" : "bg-muted/40")
      }
    >
      <div className="flex items-start justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!selected}
              onChange={() => onToggleSelect?.()}
              disabled={count === 0}
              className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              aria-label={`Selecionar coluna ${label}`}
            />
            <span className="text-sm font-semibold">{label}</span>
            <span className="rounded-full bg-background px-1.5 py-0.5 text-xs text-muted-foreground">{count}</span>
          </div>
          {desc && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{desc}</p>}
        </div>
        <button onClick={onAdd} className="shrink-0 rounded-md text-xs text-muted-foreground hover:text-foreground" aria-label="Adicionar lead">
          + novo
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={
          "flex flex-1 flex-col gap-2 rounded-lg px-2 pb-2 transition min-h-[80px] " +
          (isOver ? "bg-primary/10 ring-2 ring-primary/50" : "")
        }
      >
        {children}
      </div>
    </div>
  );
}
