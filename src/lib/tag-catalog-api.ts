import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface TagCatalogEntry {
  id: string;
  name: string;
  bg_color: string;
  text_color: string;
  created_at: string;
  updated_at: string;
}

export interface LeadHistoryEntry {
  id: string;
  lead_id: string;
  from_stage: string | null;
  to_stage: string;
  note: string | null;
  created_at: string;
}

export const tagCatalogKey = ["tag_catalog"] as const;
export const leadHistoryKey = (leadId: string) => ["lead_history", leadId] as const;
export const recentLeadHistoryKey = (limit: number) => ["lead_history_recent", limit] as const;

export function useTagCatalog() {
  return useQuery({
    queryKey: tagCatalogKey,
    queryFn: async (): Promise<TagCatalogEntry[]> => {
      const { data, error } = await supabase
        .from("tag_catalog" as never)
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TagCatalogEntry[];
    },
  });
}

export function useUpsertTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; bg_color: string; text_color: string }) => {
      const { data, error } = await supabase
        .from("tag_catalog" as never)
        .upsert(payload as never, { onConflict: "name" })
        .select()
        .single();
      if (error) throw error;
      return data as TagCatalogEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tagCatalogKey }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TagCatalogEntry> }) => {
      const { data, error } = await supabase
        .from("tag_catalog" as never)
        .update(patch as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as TagCatalogEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tagCatalogKey }),
  });
}

export function useLeadHistory(leadId: string | null) {
  return useQuery({
    queryKey: leadHistoryKey(leadId ?? ""),
    enabled: !!leadId,
    queryFn: async (): Promise<LeadHistoryEntry[]> => {
      const { data, error } = await supabase
        .from("lead_history" as never)
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeadHistoryEntry[];
    },
  });
}

// Feed global de mudanças de etapa (sem filtrar por lead) — usado no card
// "Atividade recente" do dashboard.
export function useRecentLeadHistory(limit = 15) {
  return useQuery({
    queryKey: recentLeadHistoryKey(limit),
    queryFn: async (): Promise<LeadHistoryEntry[]> => {
      const { data, error } = await supabase
        .from("lead_history" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as LeadHistoryEntry[];
    },
  });
}

export async function recordLeadHistory(
  leadId: string,
  from_stage: string | null,
  to_stage: string,
  note?: string,
) {
  await supabase.from("lead_history" as never).insert({
    lead_id: leadId,
    from_stage,
    to_stage,
    note: note ?? null,
  } as never);
}
