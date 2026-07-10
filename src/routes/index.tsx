import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { AppShell } from "@/components/AppShell";
import { LeadForm } from "@/components/LeadForm";
import { LeadDetail } from "@/components/LeadDetail";
import { LeadCard } from "@/components/LeadCard";
import { FiltersBar, defaultFilters, type FiltersState } from "@/components/FiltersBar";
import { useLeads, useUpdateLead } from "@/lib/leads-api";
import { ETAPAS, calcSLA, type EtapaFunil, type Lead } from "@/lib/domain";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: KanbanPage,
});

function KanbanPage() {
  const { data: leads = [], isLoading } = useLeads();
  const update = useUpdateLead();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [defaultStage, setDefaultStage] = useState<EtapaFunil | undefined>();
  const [detail, setDetail] = useState<Lead | null>(null);
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);

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

  // keep detail in sync
  const detailLive = detail ? leads.find((l) => l.id === detail.id) ?? null : null;

  const onDragEnd = (e: DragEndEvent) => {
    const stage = e.over?.id as EtapaFunil | undefined;
    const leadId = e.active.id as string;
    if (!stage) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.etapa_funil === stage) return;
    update.mutate(
      { id: leadId, patch: { etapa_funil: stage } },
      { onSuccess: () => toast.success(`Movido para ${ETAPAS.find((x) => x.id === stage)?.label}`) },
    );
  };

  const openNew = (stage?: EtapaFunil) => {
    setEditing(null);
    setDefaultStage(stage);
    setFormOpen(true);
  };

  return (
    <AppShell onNewLead={() => openNew()}>
      <FiltersBar value={filters} onChange={setFilters} allTags={allTags} />

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ETAPAS.map((stage) => {
            const items = filtered.filter((l) => l.etapa_funil === stage.id);
            return <Column key={stage.id} id={stage.id} label={stage.label} count={items.length} onAdd={() => openNew(stage.id)}>
              {items.map((l) => (
                <LeadCard key={l.id} lead={l} onOpen={setDetail} />
              ))}
              {items.length === 0 && (
                <div className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
                  Vazio
                </div>
              )}
            </Column>;
          })}
        </div>
      </DndContext>

      {isLoading && <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>}

      <LeadForm
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={editing}
        defaultStage={defaultStage}
      />
      <LeadDetail
        lead={detailLive}
        onOpenChange={(o) => !o && setDetail(null)}
        onEdit={(l) => { setEditing(l); setDefaultStage(undefined); setFormOpen(true); setDetail(null); }}
      />
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
          "flex flex-1 flex-col gap-2 rounded-lg px-2 pb-2 transition " +
          (isOver ? "bg-primary/5 ring-2 ring-primary/40" : "")
        }
      >
        {children}
      </div>
    </div>
  );
}
