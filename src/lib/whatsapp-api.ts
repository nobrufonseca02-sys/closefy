import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  WhatsAppConnectionStatus,
  WhatsAppConversation,
  WhatsAppMessage,
} from "./whatsapp-domain";

export const whatsappConversationsKey = ["whatsapp-conversations"] as const;
export const whatsappConnectionKey = ["whatsapp-connection"] as const;
export const whatsappMessagesKey = (conversationId: string | null) => [
  "whatsapp-messages",
  conversationId,
];

export function useWhatsAppConversations() {
  return useQuery({
    queryKey: whatsappConversationsKey,
    queryFn: async (): Promise<WhatsAppConversation[]> => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as WhatsAppConversation[];
    },
    refetchInterval: 10_000,
  });
}

export function useWhatsAppMessages(conversationId: string | null) {
  return useQuery({
    queryKey: whatsappMessagesKey(conversationId),
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<WhatsAppMessage[]> => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("sent_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as WhatsAppMessage[];
    },
    refetchInterval: 5_000,
  });
}

export function useWhatsAppConnection() {
  return useQuery({
    queryKey: whatsappConnectionKey,
    queryFn: async (): Promise<WhatsAppConnectionStatus | null> => {
      const { data, error } = await supabase
        .from("whatsapp_connection_status")
        .select("*")
        .eq("business_phone", "+5521994177491")
        .maybeSingle();
      if (error) throw error;
      return data as WhatsAppConnectionStatus | null;
    },
    refetchInterval: 15_000,
  });
}

export function useSendWhatsAppMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
    }: {
      conversationId: string;
      content: string;
    }) => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .insert({
          conversation_id: conversationId,
          direction: "outbound",
          message_type: "text",
          content: content.trim(),
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      return data as WhatsAppMessage;
    },
    onSuccess: (message) => {
      void queryClient.invalidateQueries({
        queryKey: whatsappMessagesKey(message.conversation_id),
      });
      void queryClient.invalidateQueries({ queryKey: whatsappConversationsKey });
    },
  });
}

export function useStartWhatsAppConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phone,
      displayName,
      message,
    }: {
      phone: string;
      displayName: string;
      message: string;
    }) => {
      const { data, error } = await supabase.rpc("start_whatsapp_conversation", {
        p_phone_number: phone,
        p_display_name: displayName,
        p_message: message,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: whatsappConversationsKey });
    },
  });
}

export function useMarkWhatsAppConversationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc("mark_whatsapp_conversation_read", {
        p_conversation_id: conversationId,
      });
      if (error) throw error;
      return conversationId;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: whatsappConversationsKey }),
  });
}

export function useRetryWhatsAppMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      conversationId,
    }: {
      messageId: string;
      conversationId: string;
    }) => {
      const { error } = await supabase.rpc("retry_whatsapp_message", {
        p_message_id: messageId,
      });
      if (error) throw error;
      return conversationId;
    },
    onSuccess: (conversationId) =>
      queryClient.invalidateQueries({ queryKey: whatsappMessagesKey(conversationId) }),
  });
}
