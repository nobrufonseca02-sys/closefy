import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImportantLink, Sale } from "./commerce-domain";

export const linksKey = ["important_links"] as const;
export const salesKey = ["sales"] as const;

export function useLinks() {
  return useQuery({
    queryKey: linksKey,
    queryFn: async (): Promise<ImportantLink[]> => {
      const { data, error } = await supabase
        .from("important_links")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ImportantLink[];
    },
  });
}

export function useCreateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ImportantLink>) => {
      const { data, error } = await supabase.from("important_links").insert(payload as never).select().single();
      if (error) throw error;
      return data as ImportantLink;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: linksKey }),
  });
}

export function useUpdateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ImportantLink> }) => {
      const { data, error } = await supabase.from("important_links").update(patch as never).eq("id", id).select().single();
      if (error) throw error;
      return data as ImportantLink;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: linksKey }),
  });
}

export function useDeleteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("important_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: linksKey }),
  });
}

export function useSales() {
  return useQuery({
    queryKey: salesKey,
    queryFn: async (): Promise<Sale[]> => {
      const { data, error } = await supabase.from("sales").select("*").order("sale_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Sale[];
    },
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Sale>) => {
      const { data, error } = await supabase.from("sales").insert(payload as never).select().single();
      if (error) throw error;
      return data as Sale;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKey }),
  });
}

export function useUpdateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Sale> }) => {
      const { data, error } = await supabase.from("sales").update(patch as never).eq("id", id).select().single();
      if (error) throw error;
      return data as Sale;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKey }),
  });
}

export function useDeleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKey }),
  });
}
