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
import { FiltersBar, defaultFilters, type FiltersState } from "@/components/FiltersBar";
import { useLeads, useUpdateLead } from "@/lib/leads-api";
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

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [defaultStage, setDefaultStage] = useState<EtapaFunil | undefined>();
  const [detail, setDetail] = useState<Lead | null>(null);
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Sale-on-drop pending state
  const [pendingSale, setPendingSale] = useState<{ lead: Lead; fromStage: EtapaFunil } | null>(null);
  // Standalone "Registrar compra" state (from card action)
  const [saleForLead, setSaleForLead] = useState<Lead | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  return (
    <AppShell onNewLead={() => openNew()}>
      <FiltersBar value={filters} onChange={setFilters} allTags={allTags} />

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ETAPAS.map((stage) => {
            const items = filtered.filter((l) => l.etapa_funil === stage.id);
            return (
              <Column key={stage.id} id={stage.id} label={stage.label} count={items.length} onAdd={() => openNew(stage.id)}>
                {items.map((l) => (
                  <LeadCard
                    key={l.id}
                    lead={l}
                    onOpen={setDetail}
                    onRegisterSale={(lead) => setSaleForLead(lead)}
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
  id, label, count, children, onAdd,
}: {
  id: string;
  label: string;
  count: number;
  children: React.ReactNode;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="flex w-[280px] shrink-0 flex-col rounded-xl bg-muted/40">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{label}</span>
          <span className="rounded-full bg-background px-1.5 py-0.5 text-xs text-muted-foreground">{count}</span>
        </div>
        <button onClick={onAdd} className="rounded-md text-xs text-muted-foreground hover:text-foreground" aria-label="Adicionar lead">
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
