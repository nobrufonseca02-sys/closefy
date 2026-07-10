import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Lead, LeadFeedback } from "./domain";

export const leadsKey = ["leads"] as const;
export const feedbacksKey = (leadId: string) => ["feedbacks", leadId] as const;

export function useLeads() {
  return useQuery({
    queryKey: leadsKey,
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Lead>) => {
      const { data, error } = await supabase.from("leads").insert(payload as never).select().single();
      if (error) throw error;
      return data as Lead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: leadsKey }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Lead> }) => {
      const { data, error } = await supabase
        .from("leads")
        .update({ ...patch, ultima_atividade_em: new Date().toISOString() } as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Lead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: leadsKey }),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: leadsKey }),
  });
}

export function useFeedbacks(leadId: string | null) {
  return useQuery({
    queryKey: feedbacksKey(leadId ?? ""),
    enabled: !!leadId,
    queryFn: async (): Promise<LeadFeedback[]> => {
      const { data, error } = await supabase
        .from("lead_feedbacks")
        .select("*")
        .eq("lead_id", leadId!)
        .order("data_reuniao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeadFeedback[];
    },
  });
}

export function useCreateFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<LeadFeedback> & { lead_id: string }) => {
      const { data, error } = await supabase.from("lead_feedbacks").insert(payload as never).select().single();
      if (error) throw error;
      return data as LeadFeedback;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: feedbacksKey(vars.lead_id) });
      qc.invalidateQueries({ queryKey: leadsKey });
    },
  });
}

export function useDeleteFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, leadId: _leadId }: { id: string; leadId: string }) => {
      const { error } = await supabase.from("lead_feedbacks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: feedbacksKey(vars.leadId) }),
  });
}
