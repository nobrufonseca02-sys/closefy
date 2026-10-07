import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock3,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  UserRoundPlus,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  useMarkWhatsAppConversationRead,
  useRetryWhatsAppMessage,
  useSendWhatsAppMessage,
  useStartWhatsAppConversation,
  useWhatsAppConnection,
  useWhatsAppConversations,
  useWhatsAppMessages,
  whatsappConnectionKey,
  whatsappConversationsKey,
  whatsappMessagesKey,
} from "@/lib/whatsapp-api";
import {
  conversationName,
  formatWhatsAppPhone,
  isConnectionLive,
  type WhatsAppConversation,
  type WhatsAppMessage,
} from "@/lib/whatsapp-domain";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/conversas")({
  head: () => ({ meta: [{ title: "Conversas | Closefy" }] }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const queryClient = useQueryClient();
  const { data: conversations = [], isLoading } = useWhatsAppConversations();
  const { data: connection } = useWhatsAppConnection();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newConversationOpen, setNewConversationOpen] = useState(false);

  const selected = conversations.find((item) => item.id === selectedId) || null;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) =>
      `${conversationName(conversation)} ${conversation.phone_number} ${conversation.last_message_preview || ""}`
        .toLowerCase()
        .includes(term),
    );
  }, [conversations, search]);

  useEffect(() => {
    if (!selectedId && conversations[0]) setSelectedId(conversations[0].id);
  }, [conversations, selectedId]);

  useEffect(() => {
    const channel = supabase
      .channel("closefy-whatsapp-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations" },
        () => void queryClient.invalidateQueries({ queryKey: whatsappConversationsKey }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const row = (payload.new || payload.old) as { conversation_id?: string };
          if (row.conversation_id) {
            void queryClient.invalidateQueries({
              queryKey: whatsappMessagesKey(row.conversation_id),
            });
          }
          void queryClient.invalidateQueries({ queryKey: whatsappConversationsKey });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_connection_status" },
        () => void queryClient.invalidateQueries({ queryKey: whatsappConnectionKey }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <AppShell
      primaryAction={{
        label: "Nova conversa",
        onClick: () => setNewConversationOpen(true),
      }}
    >
      <div className="flex h-[calc(100vh-5.5rem)] min-h-[620px] overflow-hidden rounded-xl border bg-card shadow-sm">
        <aside
          className={cn("w-full shrink-0 border-r lg:w-[360px]", selected && "hidden lg:block")}
        >
          <div className="border-b p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h1 className="font-semibold tracking-tight">Conversas</h1>
                <p className="text-xs text-muted-foreground">+55 21 99417-7491</p>
              </div>
              <ConnectionBadge live={isConnectionLive(connection)} />
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar conversa..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="h-[calc(100%-105px)] overflow-y-auto">
            {isLoading ? (
              <div className="grid h-40 place-items-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <MessageCircle className="mx-auto size-8 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium">Nenhuma conversa encontrada</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  As conversas aparecem aqui após o vínculo do WhatsApp.
                </p>
              </div>
            ) : (
              filtered.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  selected={conversation.id === selectedId}
                  onClick={() => setSelectedId(conversation.id)}
                />
              ))
            )}
          </div>
        </aside>

        <section className={cn("min-w-0 flex-1", !selected && "hidden lg:block")}>
          {selected ? (
            <ConversationThread
              conversation={selected}
              connected={isConnectionLive(connection)}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <div className="grid h-full place-items-center bg-muted/20 px-6 text-center">
              <div>
                <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                  <MessageCircle className="size-7" />
                </div>
                <h2 className="mt-4 font-semibold">Inbox do WhatsApp</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Selecione uma conversa para ver o histórico e responder pelo Closefy.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <NewConversationDialog
        open={newConversationOpen}
        onOpenChange={setNewConversationOpen}
        connected={isConnectionLive(connection)}
        onCreated={setSelectedId}
      />
    </AppShell>
  );
}

function ConnectionBadge({ live }: { live: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5", live ? "text-success" : "text-muted-foreground")}
    >
      <span className={cn("size-1.5 rounded-full", live ? "bg-success" : "bg-muted-foreground")} />
      {live ? "Conectado" : "Desconectado"}
    </Badge>
  );
}

function ConversationRow({
  conversation,
  selected,
  onClick,
}: {
  conversation: WhatsAppConversation;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60",
        selected && "bg-primary/5",
      )}
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {conversationName(conversation).slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{conversationName(conversation)}</span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {formatListTime(conversation.last_message_at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {conversation.last_message_from_me && (
            <CheckCheck className="size-3 shrink-0 text-primary" />
          )}
          <span className="truncate text-xs text-muted-foreground">
            {conversation.last_message_preview || "Conversa iniciada"}
          </span>
          {conversation.unread_count > 0 && (
            <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {conversation.unread_count > 99 ? "99+" : conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ConversationThread({
  conversation,
  connected,
  onBack,
}: {
  conversation: WhatsAppConversation;
  connected: boolean;
  onBack: () => void;
}) {
  const { data: messages = [], isLoading } = useWhatsAppMessages(conversation.id);
  const sendMessage = useSendWhatsAppMessage();
  const { mutate: markRead } = useMarkWhatsAppConversationRead();
  const retry = useRetryWhatsAppMessage();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversation.unread_count > 0) markRead(conversation.id);
  }, [conversation.id, conversation.unread_count, markRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const submit = async () => {
    const content = draft.trim();
    if (!content || !connected || sendMessage.isPending) return;
    setDraft("");
    try {
      await sendMessage.mutateAsync({ conversationId: conversation.id, content });
    } catch (error) {
      setDraft(content);
      toast.error("Não foi possível colocar a mensagem na fila", {
        description: (error as Error).message,
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[72px] items-center gap-3 border-b px-4">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={onBack}>
          Voltar
        </Button>
        <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {conversationName(conversation).slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{conversationName(conversation)}</div>
          <div className="text-xs text-muted-foreground">
            {formatWhatsAppPhone(conversation.phone_number)}
          </div>
        </div>
        {conversation.lead_id && (
          <Link to="/" className="ml-auto text-xs font-medium text-primary hover:underline">
            Ver no Kanban
          </Link>
        )}
      </header>

      <div className="flex-1 overflow-y-auto bg-muted/20 px-4 py-5">
        {isLoading ? (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Ainda não há mensagens disponíveis nesta conversa.
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {messages.map((message, index) => (
              <div key={message.id}>
                {shouldShowDate(messages[index - 1], message) && (
                  <div className="my-4 text-center text-[11px] font-medium text-muted-foreground">
                    {formatMessageDate(message.sent_at)}
                  </div>
                )}
                <MessageBubble
                  message={message}
                  onRetry={() =>
                    retry.mutate({ messageId: message.id, conversationId: conversation.id })
                  }
                />
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {!connected && (
        <div className="flex items-center justify-center gap-2 border-t bg-warning/10 px-4 py-2 text-xs text-warning-foreground">
          <AlertCircle className="size-3.5" /> Vincule o WhatsApp para receber e enviar mensagens.
        </div>
      )}
      <div className="border-t bg-card p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            disabled={!connected}
            rows={1}
            maxLength={4000}
            placeholder={connected ? "Digite uma mensagem..." : "WhatsApp desconectado"}
            className="max-h-32 min-h-10 resize-none"
          />
          <Button
            size="icon"
            disabled={!connected || !draft.trim() || sendMessage.isPending}
            onClick={() => void submit()}
            aria-label="Enviar mensagem"
          >
            {sendMessage.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, onRetry }: { message: WhatsAppMessage; onRetry: () => void }) {
  const outbound = message.direction === "outbound";
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          outbound
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border bg-card text-card-foreground",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[10px]",
            outbound ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
            new Date(message.sent_at),
          )}
          {outbound && <MessageStatus status={message.status} />}
        </div>
        {message.status === "failed" && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 flex items-center gap-1 text-[10px] font-medium underline underline-offset-2"
          >
            <RefreshCw className="size-3" /> Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}

function MessageStatus({ status }: { status: WhatsAppMessage["status"] }) {
  if (status === "pending" || status === "sending") return <Clock3 className="size-3" />;
  if (status === "failed") return <AlertCircle className="size-3" />;
  if (status === "delivered" || status === "read") return <CheckCheck className="size-3" />;
  return <Check className="size-3" />;
}

function NewConversationDialog({
  open,
  onOpenChange,
  connected,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connected: boolean;
  onCreated: (conversationId: string) => void;
}) {
  const startConversation = useStartWhatsAppConversation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (!connected) return toast.error("O WhatsApp ainda não está conectado");
    if (!phone.trim() || !message.trim()) return toast.error("Informe telefone e mensagem");
    try {
      const conversationId = await startConversation.mutateAsync({
        phone,
        displayName: name,
        message,
      });
      setName("");
      setPhone("");
      setMessage("");
      onOpenChange(false);
      onCreated(conversationId);
      toast.success("Conversa adicionada à fila de envio");
    } catch (error) {
      toast.error("Não foi possível iniciar a conversa", {
        description: (error as Error).message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome do contato</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome do cliente"
            />
          </div>
          <div className="space-y-1.5">
            <Label>WhatsApp</Label>
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+55 21 99999-9999"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Primeira mensagem</Label>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              maxLength={4000}
            />
          </div>
          {!connected && (
            <p className="text-xs text-destructive">
              Conecte o WhatsApp antes de iniciar uma conversa.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!connected || startConversation.isPending}
            onClick={() => void submit()}
            className="gap-2"
          >
            {startConversation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserRoundPlus className="size-4" />
            )}
            Iniciar conversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function shouldShowDate(previous: WhatsAppMessage | undefined, current: WhatsAppMessage): boolean {
  if (!previous) return true;
  return new Date(previous.sent_at).toDateString() !== new Date(current.sent_at).toDateString();
}

function formatMessageDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Hoje";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatListTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}
