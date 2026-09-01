import { useDraggable } from "@dnd-kit/core";
import { Calendar, Clock, DollarSign } from "lucide-react";
import { formatCurrency, formatDate, relativeTime, tempStyle, type Lead } from "@/lib/domain";
import { TagBadge } from "./TagBadge";

interface Props {
  lead: Lead;
  onOpen: (l: Lead) => void;
  onRegisterSale?: (l: Lead) => void;
  selected?: boolean;
  onToggleSelected?: (l: Lead) => void;
}

export function LeadCard({ lead, onOpen, onRegisterSale, selected, onToggleSelected }: Props) {
  const temp = tempStyle(lead.temperatura);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-no-pan
      className={
        "group rounded-lg border bg-card p-3 shadow-sm transition hover:shadow-md " +
        (selected ? "ring-2 ring-primary border-primary " : "") +
        (isDragging ? "opacity-40 cursor-grabbing" : "cursor-grab")
      }
    >
      <div className="flex items-start justify-between gap-2">
        {onToggleSelected && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelected(lead)}
            onPointerDown={(e) => e.stopPropagation()}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[hsl(var(--primary))]"
            aria-label={`Selecionar ${lead.nome_cliente}`}
          />
        )}
        <div className="min-w-0 flex-1" {...attributes} {...listeners}>
          <div className="truncate text-sm font-semibold">{lead.nome_cliente}</div>
          <div className="truncate text-xs text-muted-foreground">{lead.nome_empresa}</div>
        </div>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${temp.color}`}>
          {temp.label}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{formatCurrency(lead.ticket_estimado)}</span>
      </div>

      {lead.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.tags.slice(0, 3).map((t) => (
            <TagBadge key={t} name={t} />
          ))}
          {lead.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{lead.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" /> {relativeTime(lead.ultima_atividade_em)}
        </span>
        {lead.data_followup && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" /> {formatDate(lead.data_followup)}
          </span>
        )}
      </div>

      <div className="mt-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onOpen(lead)}
          className="flex-1 rounded-md border border-dashed py-1 text-[11px] text-muted-foreground hover:bg-accent"
        >
          Ver detalhes
        </button>
        {onRegisterSale && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRegisterSale(lead);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-[11px] font-medium text-success hover:bg-success/20"
            title="Registrar compra"
          >
            <DollarSign className="size-3" /> Compra
          </button>
        )}
      </div>
    </div>
  );
}
