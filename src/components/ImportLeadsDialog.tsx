import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { parseCsv, mapCsvToLeads, type CsvImportResult } from "@/lib/csv";
import { useImportLeads } from "@/lib/leads-api";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const TEMPLATE_HEADER =
  "nome_cliente,nome_empresa,whatsapp,email,cargo,faturamento_medio,numero_funcionarios,ticket_estimado,temperatura,etapa_funil,origem,hipotese_dor,tags";

export function ImportLeadsDialog({ open, onOpenChange }: Props) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importLeads = useImportLeads();

  const analyze = (raw: string) => {
    const rows = parseCsv(raw);
    setResult(mapCsvToLeads(rows));
  };

  const onFile = (file: File) => {
    file.text().then((content) => {
      setText(content);
      analyze(content);
    });
  };

  const doImport = async () => {
    if (!result || result.valid.length === 0) return;
    try {
      await importLeads.mutateAsync(result.valid);
      toast.success(`${result.valid.length} leads importados`);
      setText("");
      setResult(null);
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao importar", { description: (e as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar leads via CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Cabeçalho esperado (colunas extras são ignoradas, <code>nome_cliente</code>,{" "}
            <code>nome_empresa</code> e <code>whatsapp</code> são obrigatórias):
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted/30 p-2 text-xs">{TEMPLATE_HEADER}</pre>
          <p className="text-xs text-muted-foreground">
            <code>tags</code> aceita múltiplas tags separadas por <code>|</code> (ex: <code>Escritório|Jurídico</code>).
            Valores inválidos de <code>temperatura</code>/<code>etapa_funil</code> caem no padrão.
          </p>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Escolher arquivo .csv
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <span className="text-xs text-muted-foreground">ou cole o conteúdo abaixo</span>
          </div>

          <Textarea
            rows={8}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) analyze(e.target.value);
              else setResult(null);
            }}
            placeholder={TEMPLATE_HEADER}
            className="font-mono text-xs"
          />

          {result && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div className="font-medium text-foreground">
                {result.valid.length} lead(s) prontos para importar
                {result.errors.length > 0 && `, ${result.errors.length} linha(s) com erro`}
              </div>
              {result.errors.length > 0 && (
                <ul className="mt-1 max-h-24 overflow-y-auto text-muted-foreground">
                  {result.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>Linha {e.line}: {e.reason}</li>
                  ))}
                  {result.errors.length > 10 && <li>... e mais {result.errors.length - 10}</li>}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={doImport}
            disabled={!result || result.valid.length === 0 || importLeads.isPending}
          >
            Importar {result?.valid.length ?? 0} lead(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
